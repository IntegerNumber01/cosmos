"""Independent native-grid differential photometry for blind-search follow-up.

Reference positions are blind image detections, isolated by seven native pixels. Each exposure
is fitted independently. Pairwise offsets and scatter come from common clean reference sources.
These are empirical screening statistics, not a calibrated false-alarm probability.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import numpy as np
from spherex_io import load_l2
from search_fields import ROOT, mask, aperture, detect, clean_json
from validation.measure import psf_fit
from validation.epsf import EPSF, free_fit


def measure(im,bad,psf,ra,dec,neighbours=()):
    x,y=(float(v) for v in im.wcs.world_to_pixel_values(ra,dec))
    h,w=im.image.shape
    if not (12<=x<w-12 and 12<=y<h-12):return None
    gauss=psf_fit(im,x,y,bad,half=4,max_shift=1.5,smax=2.5)
    if not gauss or not gauss['ok'] or gauss['n_bad_core']:return None
    cx,cy=gauss['x'],gauss['y']
    fixed=[tuple(float(v) for v in im.wcs.world_to_pixel_values(a,d)) for a,d in neighbours]
    fit=free_fit(im,bad,psf,cx,cy,fixed=fixed,half=5,max_shift=1.0)
    if not fit or not fit['ok'] or fit['flux']/fit['flux_err']<8:return None
    # Check bad core again at the fitted location, not just the supplied coordinates.
    yy,xx=np.indices(im.image.shape)
    if bad[(xx-fit['x'])**2+(yy-fit['y'])**2<=4].any():return None
    wl,bw=im.wavelength_at(fit['x'],fit['y'])
    cra,cdec=im.wcs.pixel_to_world_values(fit['x'],fit['y'])
    return dict(ra=ra,dec=dec,centroid_ra=float(cra),centroid_dec=float(cdec),wavelength=wl,bandwidth=bw,
                epsf=fit,gaussian=gauss,flags=im.flags_at(fit['x'],fit['y'],3),
                apertures={str(r):aperture(im,fit['x'],fit['y'],bad,radius=r) for r in (2.,2.5,3.,4.)})


def assess(name,folder,ra,dec,bands,neighbours=()):
    out=ROOT/'data/work/discovery/assessments'/name;out.mkdir(parents=True,exist_ok=True)
    frames=[]
    for p in sorted(folder.glob('*.fits')):
        im=load_l2(p);det=int(im.header['DETECTOR'])
        x,y=(float(v) for v in im.wcs.world_to_pixel_values(ra,dec))
        wl,bw=im.wavelength_at(x,y)
        if not any(det==d and abs(wl-w)<=t*bw for d,w,t in bands):continue
        frames.append(dict(path=p,im=im,bad=mask(im,warnings=True),psf=EPSF(p),wl=wl,bw=bw,det=det,mjd=float(im.header['MJD-AVG'])))
    frames.sort(key=lambda r:r['mjd'])
    # A union of blind, isolated positions from every selected image avoids a reference-only epoch bias.
    positions=[]
    for f in frames:
        xy=detect(f['im'],f['bad'])
        for i,(x,y) in enumerate(xy):
            if np.sum(np.hypot(*(xy-xy[i]).T)<7)>1:continue
            a,d=(float(v) for v in f['im'].wcs.pixel_to_world_values(x,y))
            def sep(b,e):return math.hypot((a-b)*math.cos(math.radians(d)),d-e)*3600
            if sep(ra,dec)<50 or any(sep(b,e)<8 for b,e in positions):continue
            positions.append((a,d))
            if len(positions)>=80:break
        if len(positions)>=80:break
    measurements=[]
    for f in frames:
        im,bad,psf=f['im'],f['bad'],f['psf']
        target=measure(im,bad,psf,ra,dec,neighbours)
        refs=[measure(im,bad,psf,a,d) for a,d in positions]
        row=dict(file=str(f['path'].relative_to(ROOT)).replace('\\','/'),obsid=str(im.header['OBSID']),det=f['det'],date=str(im.header['DATE-AVG']),mjd=f['mjd'],target=target,references=refs)
        measurements.append(row)
        print(name,row['date'],'D'+str(row['det']),'target',round(target['epsf']['flux'],3) if target else None,'refs',sum(r is not None for r in refs),flush=True)
    pairs=[]
    for i,a in enumerate(measurements):
        for b in measurements[i+1:]:
            if a['det']!=b['det'] or b['mjd']-a['mjd']<1 or not a['target'] or not b['target']:continue
            ta,tb=a['target'],b['target']
            dw=abs(ta['wavelength']-tb['wavelength'])/min(ta['bandwidth'],tb['bandwidth'])
            if dw>.5:continue
            for method in ('epsf','2.0','2.5','3.0','4.0'):
                def values(t):
                    if method=='epsf':return t['epsf']['flux'],t['epsf']['flux_err']
                    ap=t['apertures'][method]
                    return (ap['flux'],ap['err']) if ap and ap['snr']>=8 else (None,None)
                fa,ea=values(ta);fb,eb=values(tb)
                if fa is None or fb is None or min(fa,fb)<=0:continue
                controls=[]
                for k,(u,v) in enumerate(zip(a['references'],b['references'])):
                    if not u or not v or max(u['epsf']['chi2r'],v['epsf']['chi2r'])>20:continue
                    if abs(u['wavelength']-v['wavelength'])>.5*min(u['bandwidth'],v['bandwidth']):continue
                    fu,eu=values(u);fv,ev=values(v)
                    if fu is None or fv is None or min(fu,fv)<=0:continue
                    if max(eu/fu,ev/fv)>.1:continue
                    controls.append(dict(index=k,ra=positions[k][0],dec=positions[k][1],logratio=math.log(fv/fu),logerr=math.hypot(eu/fu,ev/fv)))
                if len(controls)<6:continue
                logs=np.array([c['logratio'] for c in controls]);offset=float(np.median(logs));scatter=float(1.4826*np.median(np.abs(logs-offset)))
                residual=math.log(fb/fa)-offset;floor=max(.03,scatter)
                error=math.sqrt((ea/fa)**2+(eb/fb)**2+floor**2)
                pairs.append(dict(method=method,file_a=a['file'],file_b=b['file'],date_a=a['date'],date_b=b['date'],det=a['det'],
                                  wave_a=ta['wavelength'],wave_b=tb['wavelength'],dlambda_bw=dw,flux_a=fa,flux_b=fb,error_a=ea,error_b=eb,
                                  ratio=math.exp(residual),ratio_error=math.exp(residual)*error,dmag=-2.5/math.log(10)*residual,
                                  log_significance=abs(residual)/error,ensemble_n=len(controls),ensemble_offset=offset,ensemble_scatter=scatter,systematic_floor=floor,controls=controls))
    result=clean_json(dict(name=name,ra=ra,dec=dec,neighbours=neighbours,reference_selection='blind, separated by >=7 native pixels; same reference identities per pair',
                           reference_positions=positions,bands=bands,measurements=measurements,pairs=pairs))
    (out/'photometry.json').write_text(json.dumps(result,indent=2))
    for r in pairs:
        if r['method']=='epsf':print('PAIR',r['date_a'][:10],r['date_b'][:10],f"D{r['det']} {r['wave_a']:.5f} ratio={r['ratio']:.3f}+/-{r['ratio_error']:.3f} controls={r['ensemble_n']} scatter={r['ensemble_scatter']:.3f} dlambda={r['dlambda_bw']:.3f}",flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('folder',type=Path);p.add_argument('ra',type=float);p.add_argument('dec',type=float)
    p.add_argument('--band',action='append',required=True);p.add_argument('--neighbour',action='append',default=[])
    a=p.parse_args();assess(a.name,a.folder.resolve(),a.ra,a.dec,[(int(d),float(w),float(t)) for d,w,t in (s.split(':') for s in a.band)],
                          [tuple(map(float,s.split(':'))) for s in a.neighbour])
