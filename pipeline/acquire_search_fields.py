"""Acquire reproducible fresh search fields using public DR1 SIA + IBE only.
Modest concurrency (3), bounded HTTP timeouts/retries, resumable header scans and downloads.
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from astropy.io import fits
from astropy.wcs import WCS

from validation.scan import wave_at_header, matched_sets

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw/discovery'
FIELDS={
    'ngc1333': (52.30,31.30),
    'ic348': (56.13,32.15),
    'l1688': (246.75,-24.45),
    'serpens': (277.49,1.233),
    'ngc2264': (100.25,9.88),
    'orion_l1641': (84.0,-6.0),
}
SIZE=0.3

def get(url, *, headers=None, prefix=None, header_only=False):
    error=None
    for attempt in range(3):
        try:
            r=requests.get(url,headers=headers,timeout=(10,35),stream=header_only)
            r.raise_for_status()
            if header_only:
                data=b''
                for chunk in r.iter_content(120000):
                    data+=chunk
                    if len(data)>=120000: break
                r.close()
            else: data=r.content
            if prefix and not data.startswith(prefix): raise RuntimeError('Unexpected response content')
            return data
        except Exception as e:
            error=e
            time.sleep(2*(attempt+1))
    raise RuntimeError(str(error))

def read_header(url):
    data=get(url,headers={'Range':'bytes=0-119999'},prefix=b'SIMPLE',header_only=True)
    end=data.find(b'END'+b' '*77)
    if end<0: raise RuntimeError('No primary header END')
    start=((end+80+2879)//2880)*2880
    end2=data.find(b'END'+b' '*77,start)
    if end2<0: raise RuntimeError('No IMAGE header END')
    return fits.Header.fromstring(data[start:end2+80].decode('ascii'))

def acquire(name,detectors=(2,5),sets_per_detector=2):
    ra,dec=FIELDS[name]
    folder=RAW/name
    folder.mkdir(parents=True,exist_ok=True)
    sia=folder/'sia2.csv'
    # Query centre coverage, then inspect the surrounding 18′ cutout. A larger SIA circle timed out
    # repeatedly; this deliberately does not claim a complete mosaic of edge-only exposures.
    query=f'https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+{ra}+{dec}+0.005&RESPONSEFORMAT=csv'
    print(name,'querying centre-covering DR1 exposures',flush=True)
    if not sia.exists(): sia.write_bytes(get(query))
    rows=[r for r in csv.DictReader(io.StringIO(sia.read_text(encoding='utf-8-sig'))) if r.get('dataproduct_subtype')=='science' and int(r['energy_bandpassname'][-1]) in detectors]
    oldpath=folder/'frames.json'
    old=json.loads(oldpath.read_text()) if oldpath.exists() else []
    have={r['url']:r for r in old if 'error' not in r}
    def scan(row):
        url=row['access_url']
        if url in have: return have[url]
        try:
            h=read_header(url)
            x,y=WCS(h).world_to_pixel_values(ra,dec)
            inside=20<=x<=h['NAXIS1']-21 and 20<=y<=h['NAXIS2']-21
            wl,bw=wave_at_header(h,int(h['DETECTOR']),float(x),float(y)) if inside else (None,None)
            return dict(obs_id=str(h['OBSID']),det=int(h['DETECTOR']),url=url,date_avg=str(h['DATE-AVG']),mjd=float(h['MJD-AVG']),
                        x=float(x),y=float(y),inside=bool(inside),wavelength_um=wl,bandwidth_um=bw,l2dqa=str(h.get('L2DQAFLG','')))
        except Exception as e: return dict(url=url,error=str(e))
    print(name,'scanning',len(rows),'DR1 headers',flush=True)
    scanned=[]
    with ThreadPoolExecutor(3) as ex:
        for f in as_completed([ex.submit(scan,r) for r in rows]):
            scanned.append(f.result())
            if len(scanned)%20==0:
                oldpath.write_text(json.dumps(scanned,indent=1))
                print(name,'headers',len(scanned),'/',len(rows),'errors',sum('error' in r for r in scanned),flush=True)
    oldpath.write_text(json.dumps(scanned,indent=1))
    chosen=[]
    for det in detectors:
        used=[]
        for s in matched_sets([f for f in scanned if 'error' not in f],det,max_per_visit=2,max_frames=6):
            if any(abs(s['lam_ref']-w)<s['bw'] for w in used): continue
            used.append(s['lam_ref']); chosen.extend(s['frames'])
            if len(used)>=sets_per_detector: break
    unique={f"{f['obs_id']}D{f['det']}":f for f in chosen}
    def download(pair):
        key,f=pair
        dest=folder/f'{key}.fits'
        url=f"{f['url']}?center={ra},{dec}d&size={SIZE}"
        if not dest.exists():
            payload=get(url,prefix=b'SIMPLE')
            with fits.open(io.BytesIO(payload)) as h:
                assert str(h['IMAGE'].header['OBSID'])==f['obs_id']
            dest.write_bytes(payload)
        return dict(file=str(dest.relative_to(ROOT)).replace('\\','/'),cutout_url=url,source=f['url'],obsid=f['obs_id'],detector=f['det'],bytes=dest.stat().st_size)
    entries=[]
    print(name,'downloading',len(unique),'selected cutouts',flush=True)
    with ThreadPoolExecutor(3) as ex:
        for f in as_completed([ex.submit(download,pair) for pair in unique.items()]):
            try:
                entries.append(f.result()); print(name,'cutouts',len(entries),'/',len(unique),flush=True)
            except Exception as e: print(name,'DOWNLOAD ERROR',str(e),flush=True)
    manifest=dict(field=name,ra=ra,dec=dec,size_deg=SIZE,release='dr1',query=query,detectors=list(detectors),frames=entries,
                  selection='two separated wavelength sets per detector; up to two frames per visit; up to six per set',requested=len(unique),complete=len(entries)==len(unique))
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(name,'COMPLETE',len(entries),'cutouts',sum(f['bytes'] for f in entries),'bytes',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('fields',nargs='*',default=list(FIELDS));p.add_argument('--detectors',default='2,5');p.add_argument('--sets',type=int,default=2)
    args=p.parse_args()
    for field in args.fields: acquire(field,tuple(map(int,args.detectors.split(','))),args.sets)
