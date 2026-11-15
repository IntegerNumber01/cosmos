"""Expand a blind lead using every centre-covering DR1 header and explicit local-wavelength windows.

Headers are cached separately from downloaded cutouts. Selection does not inspect source brightness.
The original blind-screen inventories are preserved; each follow-up has a separate manifest.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from astropy.io import fits
from astropy.wcs import WCS
from acquire_search_fields import ROOT, RAW, FIELDS, SIZE, read_header, get
from validation.scan import wave_at_header

CACHE=ROOT/'data/work/discovery/headers'


def inventory(field,ra,dec):
    CACHE.mkdir(parents=True,exist_ok=True)
    rows=list(csv.DictReader(io.StringIO((RAW/field/'sia2.csv').read_text(encoding='utf-8-sig'))))
    rows=[r for r in rows if r.get('dataproduct_subtype')=='science' and r['energy_bandpassname'][-1] in ('2','5')]
    def one(row):
        url=row['access_url'];p=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.hdr')
        try:
            if p.exists(): h=fits.Header.fromstring(p.read_text(),sep='\n')
            else:
                h=read_header(url);p.write_text(h.tostring(sep='\n',endcard=True,padding=False))
            x,y=(float(v) for v in WCS(h).world_to_pixel_values(ra,dec))
            inside=20<=x<h['NAXIS1']-20 and 20<=y<h['NAXIS2']-20
            det=int(h['DETECTOR']);wl,bw=wave_at_header(h,det,x,y) if inside else (None,None)
            return dict(obsid=str(h['OBSID']),det=det,url=url,date=str(h['DATE-AVG']),mjd=float(h['MJD-AVG']),
                        inside=inside,wavelength=wl,bandwidth=bw,qa=str(h.get('L2DQAFLG','')),header_cache=str(p.relative_to(ROOT)))
        except Exception as e:return dict(url=url,error=str(e))
    out=[]
    with ThreadPoolExecutor(3) as ex:
        for f in as_completed([ex.submit(one,row) for row in rows]):
            out.append(f.result())
            if len(out)%20==0: print(field,'headers',len(out),'/',len(rows),flush=True)
    return sorted(out,key=lambda r:(r.get('det',0),r.get('mjd',0)))


def followup(name,field,ra,dec,bands,list_only=False):
    folder=RAW/field
    inv=inventory(field,ra,dec)
    selected=[r for r in inv if r.get('inside') and any(r['det']==d and abs(r['wavelength']-wl)<=tol*r['bandwidth'] for d,wl,tol in bands)]
    selected.sort(key=lambda r:r['mjd'])
    for r in selected:
        print(r['date'],f"D{r['det']}",f"{r['wavelength']:.6f}",r['obsid'],r['qa'],flush=True)
    result=dict(name=name,field=field,ra=ra,dec=dec,release='dr1',bands=[dict(det=d,centre_um=w,halfwidth_in_bandwidth=t) for d,w,t in bands],
                selection='All available centre-covering exposures in explicit wavelength windows at the candidate. No brightness-based selection.',
                inventory=inv,selected=selected,downloads=[],errors=[],list_only=list_only)
    if not list_only:
        cra,cdec=FIELDS[field]
        def download(r):
            p=folder/f"{r['obsid']}D{r['det']}.fits"
            url=f"{r['url']}?center={cra},{cdec}d&size={SIZE}"
            if not p.exists():
                payload=get(url,prefix=b'SIMPLE')
                with fits.open(io.BytesIO(payload)) as hd:
                    assert str(hd['IMAGE'].header['OBSID'])==r['obsid']
                    assert int(hd['IMAGE'].header['DETECTOR'])==r['det']
                p.write_bytes(payload)
            return dict(file=str(p.relative_to(ROOT)).replace('\\','/'),source=r['url'],cutout_url=url,bytes=p.stat().st_size)
        with ThreadPoolExecutor(3) as ex:
            jobs={ex.submit(download,r):r for r in selected}
            for f in as_completed(jobs):
                try:result['downloads'].append(f.result())
                except Exception as e:result['errors'].append(dict(obsid=jobs[f]['obsid'],det=jobs[f]['det'],error=str(e)))
    p=folder/f'followup_{name}.json';p.write_text(json.dumps(result,indent=2))
    print(name,'selected',len(selected),'downloaded/present',len(result['downloads']),'errors',len(result['errors']),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('field',choices=FIELDS);p.add_argument('ra',type=float);p.add_argument('dec',type=float)
    p.add_argument('--band',action='append',required=True,help='detector:centre_um:halfwidth_in_channel_bandwidth')
    p.add_argument('--list-only',action='store_true');a=p.parse_args()
    followup(a.name,a.field,a.ra,a.dec,[(int(d),float(w),float(t)) for d,w,t in (s.split(':') for s in a.band)],a.list_only)
