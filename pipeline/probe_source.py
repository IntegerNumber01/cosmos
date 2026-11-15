"""Re-measure one blind-search lead on every native cutout in its field.
Reports multiple aperture radii, independent Gaussian/EPSF fits, flags, timestamps, wavelengths,
and optional catalogue responses. Does not decide whether a lead is new.
"""
from __future__ import annotations
import argparse
import io
import json
import math
from pathlib import Path

import numpy as np
import requests
from astropy.table import Table

from spherex_io import load_l2
from search_fields import mask, aperture, clean_json
from validation.measure import psf_fit
from validation.epsf import EPSF, free_fit

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/work/discovery/probes'

def table_rows(table):
    return [dict(zip(table.colnames,[None if np.ma.is_masked(table[c][i]) else str(table[c][i]) if c.lower() in ('source_id','oid') else table[c][i].item() if isinstance(table[c][i],np.generic) else table[c][i] for c in table.colnames])) for i in range(len(table))]

def tap(url,query):
    r=requests.post(url,data={'REQUEST':'doQuery','LANG':'ADQL','FORMAT':'votable','QUERY':query},timeout=(10,45))
    r.raise_for_status()
    if b'QUERY_STATUS" value="ERROR' in r.content:raise RuntimeError(r.text[-700:])
    return table_rows(Table.read(io.BytesIO(r.content),format='votable'))

def catalogues(ra,dec,out):
    data={}
    cone=f"1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra},{dec},0.005))"
    for host in ['https://simbad.harvard.edu/simbad/sim-tap/sync','https://simbad.cds.unistra.fr/simbad/sim-tap/sync']:
        try:
            data['simbad']={'host':host,'rows':tap(host,f'SELECT TOP 20 main_id,ra,dec,pmra,pmdec,otype,plx_value FROM basic WHERE {cone}')};break
        except Exception as e:data['simbad']={'error':str(e)}
    try:
        q=f'SELECT TOP 20 source_id,ra,dec,pmra,pmdec,parallax,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,phot_variable_flag,ruwe FROM gaiadr3.gaia_source WHERE {cone}'
        data['gaia']={'rows':tap('https://gea.esac.esa.int/tap-server/tap/sync',q)}
    except Exception as e:data['gaia']={'error':str(e)}
    if 'error' in data.get('gaia',{}):
        try:
            request={'service':'Mast.Catalogs.GaiaDR3.Cone','params':{'ra':ra,'dec':dec,'radius':0.005},'format':'json','pagesize':100,'page':1}
            r=requests.post('https://mast.stsci.edu/api/v0/invoke',data={'request':json.dumps(request)},timeout=(10,45));r.raise_for_status()
            body=r.json()
            if body.get('status')!='COMPLETE':raise RuntimeError(str(body)[:250])
            data['gaia']={'host':'MAST Gaia DR3 cone','rows':body['data']}
        except Exception as e:data['gaia']['mast_error']=str(e)
    try:
        url='https://vizier.cds.unistra.fr/viz-bin/conesearch/B/vsx/vsx'
        r=requests.get(url,params={'RA':ra,'DEC':dec,'SR':0.005},timeout=(10,45));r.raise_for_status()
        (out/'vsx.xml').write_bytes(r.content)
        data['vsx']={'url':r.url,'rows':table_rows(Table.read(io.BytesIO(r.content),format='votable'))}
    except Exception as e:data['vsx']={'error':str(e)}
    if 'error' in data.get('vsx',{}):
        try:
            url='https://vizier.cfa.harvard.edu/viz-bin/votable'
            r=requests.get(url,params={'-source':'B/vsx/vsx','-c':f'{ra} {dec}','-c.rs':18,'-out.all':'1'},timeout=(10,45));r.raise_for_status()
            (out/'vsx_harvard.xml').write_bytes(r.content)
            data['vsx']={'host':url,'rows':table_rows(Table.read(io.BytesIO(r.content),format='votable'))}
        except Exception as e:data['vsx']['harvard_error']=str(e)
    (out/'catalogues.json').write_text(json.dumps(clean_json(data),indent=2))
    summary={key: {'matches':len(value.get('rows',[])), 'error':value.get('error'),
                   'ids':[r.get('main_id',r.get('Name',r.get('source_id'))) for r in value.get('rows',[])][:20]}
             for key,value in data.items()}
    print('CATALOGUES',json.dumps(clean_json(summary)),flush=True)
    return data

def probe(name,folder,ra,dec,do_catalogues=False):
    out=OUT/name;out.mkdir(parents=True,exist_ok=True)
    rows=[]
    for path in sorted(folder.glob('*.fits')):
        im=load_l2(path);bad=mask(im,warnings=True)
        x,y=(float(v) for v in im.wcs.world_to_pixel_values(ra,dec))
        h,w=im.image.shape
        if not(12<=x<w-12 and 12<=y<h-12):continue
        wl,bw=im.wavelength_at(x,y)
        fit=psf_fit(im,x,y,bad,half=5,max_shift=2.0,smax=3.0)
        centred=bool(fit and fit['ok'] and fit['n_bad_core']==0)
        cx,cy=(fit['x'],fit['y']) if centred else (x,y)
        apertures={str(r):aperture(im,cx,cy,bad,radius=r) for r in [2.,2.5,3.,4.]}
        psf=None
        if centred:
            try:psf=free_fit(im,bad,EPSF(path),cx,cy,half=5,max_shift=1.5)
            except Exception as e:psf={'error':str(e)}
        cra,cdec=im.wcs.pixel_to_world_values(cx,cy)
        rows.append(dict(file=str(path.relative_to(ROOT)).replace('\\','/'),obsid=str(im.header['OBSID']),det=int(im.header['DETECTOR']),
                         date=str(im.header['DATE-AVG']),mjd=float(im.header['MJD-AVG']),qa=str(im.header.get('L2DQAFLG','')),
                         wavelength=wl,bandwidth=bw,x=x,y=y,centroid_ra=float(cra),centroid_dec=float(cdec),
                         flags=im.flags_at(x,y,3),clean_centroid=centred,gaussian=fit,epsf=psf,apertures=apertures))
    rows.sort(key=lambda r:(r['det'],r['wavelength'],r['mjd']))
    (out/'measurements.json').write_text(json.dumps(clean_json(dict(name=name,ra=ra,dec=dec,rows=rows)),indent=2))
    for r in rows:
        a=r['apertures']['3.0'];eps=r['epsf']
        print('%s D%d %.5f um aper=%s epsf=%s fit=%s flags=%s' %(r['date'][:10],r['det'],r['wavelength'],
              '%.3f'%a['flux'] if a else 'NA','%.3f'%eps['flux'] if eps and eps.get('ok') else 'NA',r['clean_centroid'],','.join(r['flags'])),flush=True)
    if do_catalogues:catalogues(ra,dec,out)
    return rows

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('folder',type=Path);p.add_argument('ra',type=float);p.add_argument('dec',type=float);p.add_argument('--catalogues',action='store_true')
    a=p.parse_args();probe(a.name,a.folder.resolve(),a.ra,a.dec,a.catalogues)
