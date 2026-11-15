"""Blind, native-grid variability screening of real SPHEREx DR1 cutouts.

This is candidate generation, NOT a discovery classifier. No known-source positions enter detection.
The output retains failed quality gates and full exposure provenance for independent follow-up.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from astropy.stats import sigma_clipped_stats
from scipy.ndimage import gaussian_filter, maximum_filter, binary_dilation
from scipy.spatial import cKDTree

from spherex_io import load_l2, REJECT_FLAG_NAMES

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/work/discovery"


def clean_json(obj):
    if isinstance(obj, dict): return {str(k): clean_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return [clean_json(v) for v in obj]
    if isinstance(obj, np.ndarray): return clean_json(obj.tolist())
    if isinstance(obj, (float, np.floating)): return float(obj) if np.isfinite(obj) else None
    if isinstance(obj, (int, np.integer)): return int(obj)
    if isinstance(obj, np.bool_): return bool(obj)
    return obj


def mask(im, warnings=False):
    names = REJECT_FLAG_NAMES - {"OUTLIER"}
    if warnings: names |= {"GHOST", "GHOST_FPA", "GHOST_EXT", "CROSSTALK", "STREAK", "SNOWBALL", "BLOOM"}
    bits = 0
    for name, (bit, _) in im.flag_defs.items():
        if name in names: bits |= bit
    return ((im.flags & bits) != 0) | ~np.isfinite(im.image) | ~np.isfinite(im.variance) | (im.variance <= 0)


def aperture(im, x, y, bad, radius=3.0):
    h, w = im.image.shape
    xi, yi = int(round(x)), int(round(y))
    r = 11
    if xi < r or yi < r or xi >= w-r or yi >= h-r: return None
    sl = np.s_[yi-r:yi+r+1, xi-r:xi+r+1]
    yy, xx = np.mgrid[yi-r:yi+r+1, xi-r:xi+r+1]
    rr = np.hypot(xx-x, yy-y)
    ap = rr <= radius
    ann = (rr >= 6) & (rr <= 10) & ~bad[sl]
    if bad[sl][ap].any() or ann.sum() < 35: return None
    _, sky, std = sigma_clipped_stats(im.image[sl][ann], sigma=3)
    val = im.image[sl][ap]
    flux = np.sum(val - sky)
    err = np.sqrt(np.sum(im.variance[sl][ap]) + ap.sum()**2 * std**2 * math.pi/2/ann.sum())
    # Empirical single-pixel sky scatter floor; later an ensemble floor covers PSF/calibration changes.
    nominal_sky = np.median(np.sqrt(im.variance[sl][ann]))
    err *= max(1.0, float(std / nominal_sky))
    if not np.isfinite(flux) or not np.isfinite(err) or err <= 0: return None
    return dict(flux=float(flux), err=float(err), snr=float(flux/err), background=float(sky), n_ap=int(ap.sum()))


def detect(im, bad):
    finite = im.image[~bad]
    if len(finite) < 100: return np.zeros((0,2))
    _, sky, std = sigma_clipped_stats(finite, sigma=3)
    filled = np.where(bad, sky, im.image)
    smoothed = gaussian_filter(filled, 0.8)
    maxima = (smoothed == maximum_filter(smoothed, size=7)) & (smoothed > sky + 4*std)
    maxima &= ~binary_dilation(bad, iterations=3)
    maxima[:12] = maxima[-12:] = False
    maxima[:,:12] = maxima[:,-12:] = False
    yy,xx = np.where(maxima)
    order=np.argsort(smoothed[yy,xx])[::-1][:500]
    points=[]
    for i in order:
        x,y=float(xx[i]),float(yy[i])
        a=aperture(im,x,y,bad)
        if a and a['snr'] >= 12: points.append((x,y))
    return np.asarray(points,float).reshape(-1,2)


def inspect_file(path):
    im=load_l2(path)
    bad=mask(im, warnings=True)
    sources=detect(im,bad)
    if len(sources):
        ra,dec=im.wcs.pixel_to_world_values(sources[:,0],sources[:,1])
        wavelength,bandwidth=im.wave_wcs.pixel_to_world_values(sources[:,0],sources[:,1])
    else:
        ra=dec=wavelength=bandwidth=np.array([])
    return dict(im=im,bad=bad,sources=sources,ra=ra,dec=dec,wavelength=wavelength,bandwidth=bandwidth,
                mjd=float(im.header['MJD-AVG']),det=int(im.header['DETECTOR']),path=path)


def compare(a,b,min_baseline=40,wave_tolerance=0.5):
    if b['mjd']-a['mjd'] < min_baseline or a['det'] != b['det'] or not len(a['sources']): return []
    ai,bi=a['im'],b['im']
    xb,yb=bi.wcs.world_to_pixel_values(a['ra'],a['dec'])
    wb,bwb=bi.wave_wcs.pixel_to_world_values(xb,yb)
    dx=np.abs(a['wavelength']-wb)/np.minimum(a['bandwidth'],bwb)
    good=np.isfinite(dx)&(dx <= wave_tolerance)
    rows=[]
    for i in np.where(good)[0]:
        p=aperture(ai,*a['sources'][i],a['bad'])
        q=aperture(bi,float(xb[i]),float(yb[i]),b['bad'])
        if not p or not q or min(p['snr'],q['snr']) < 10: continue
        # Reject obvious blends: another detected peak within 4 native pixels.
        if len(a['sources'])>1 and np.sum(np.hypot(*(a['sources']-a['sources'][i]).T)<4)>1: continue
        logratio=math.log(q['flux']/p['flux'])
        err=math.hypot(p['err']/p['flux'],q['err']/q['flux'])
        rows.append(dict(index=int(i),ra=float(a['ra'][i]),dec=float(a['dec'][i]),x=float(a['sources'][i,0]),y=float(a['sources'][i,1]),
                         wave_a=float(a['wavelength'][i]),wave_b=float(wb[i]),dlambda_bw=float(dx[i]),a=p,b=q,logratio=logratio,logerr=err))
    if len(rows)<6: return []
    logs=np.array([r['logratio'] for r in rows])
    med=float(np.median(logs))
    scatter=float(1.4826*np.median(np.abs(logs-med)))
    # Non-zero 3% log-flux floor prevents arbitrarily large nominal significances.
    floor=max(0.03,scatter)
    for r in rows:
        d=r['logratio']-med
        r.update(dmag=float(-2.5/math.log(10)*d),ratio=float(math.exp(d)),
                 significance=float(abs(d)/math.hypot(r['logerr'],floor)),
                 ensemble_n=len(rows),ensemble_log_offset=med,ensemble_log_scatter=scatter,ensemble_floor=floor,
                 detector=a['det'],mjd_a=a['mjd'],mjd_b=b['mjd'],
                 date_a=str(ai.header['DATE-AVG']),date_b=str(bi.header['DATE-AVG']),
                 obsid_a=str(ai.header['OBSID']),obsid_b=str(bi.header['OBSID']),
                 file_a=str(a['path'].relative_to(ROOT)).replace('\\','/'),file_b=str(b['path'].relative_to(ROOT)).replace('\\','/'))
    return rows


def group_candidates(rows):
    groups=[]
    for row in sorted(rows,key=lambda r:r['significance'],reverse=True):
        if row['significance'] < 4 or abs(row['dmag']) < 0.15: continue
        existing=next((g for g in groups if math.hypot((g['ra']-row['ra'])*math.cos(math.radians(row['dec'])),g['dec']-row['dec'])*3600 < 5),None)
        if existing is None:
            existing=dict(ra=row['ra'],dec=row['dec'],measurements=[])
            groups.append(existing)
        existing['measurements'].append(row)
    for g in groups:
        g['best']=g['measurements'][0]
        g['n_pairs']=len(g['measurements'])
        g['n_unique_frames']=len({r[k] for r in g['measurements'] for k in ('file_a','file_b')})
        g['detectors']=sorted({r['detector'] for r in g['measurements']})
    return groups


def run(field,paths):
    loaded=[]
    for path in paths:
        try: loaded.append(inspect_file(path))
        except Exception as e: print('LOAD ERROR',path.name,str(e),flush=True)
    loaded.sort(key=lambda a:a['mjd'])
    all_rows=[]
    n_pairs=0
    for ia,a in enumerate(loaded):
        for b in loaded[ia+1:]:
            rows=compare(a,b)
            if rows: n_pairs+=1; all_rows.extend(rows)
    candidates=group_candidates(all_rows)
    result=dict(field=field,generated=datetime.now(timezone.utc).isoformat(),method='blind local maxima + native-grid aperture ratios + strict local wavelength match + ensemble floor',
                frames=len(loaded),source_detections=sum(len(a['sources']) for a in loaded),usable_pairs=n_pairs,source_pair_measurements=len(all_rows),candidates=candidates,
                frame_inventory=[dict(file=str(a['path'].relative_to(ROOT)).replace('\\','/'),obsid=str(a['im'].header['OBSID']),det=a['det'],date=str(a['im'].header['DATE-AVG']),sources=len(a['sources'])) for a in loaded])
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/f'{field}_screen.json').write_text(json.dumps(clean_json(result),indent=2))
    print(field,'frames',len(loaded),'sources',result['source_detections'],'pairs',n_pairs,'source-pairs',len(all_rows),'candidates',len(candidates),flush=True)
    for g in candidates[:12]:
        b=g['best']
        print('  %.7f %+.7f D%d %.3fum dmag=%+.2f sig=%.1f pairs=%d frames=%d' % (g['ra'],g['dec'],b['detector'],b['wave_a'],b['dmag'],b['significance'],g['n_pairs'],g['n_unique_frames']),flush=True)
    return result


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('fields',nargs='*',default=['barnard','epsindib','wise0855','rwaur','rdra'])
    ap.add_argument('--directory',type=Path)
    args=ap.parse_args()
    for field in args.fields:
        folder=(args.directory/field).resolve() if args.directory else ROOT/'data/raw/validation'/field
        run(field,sorted(folder.glob('*.fits')))
