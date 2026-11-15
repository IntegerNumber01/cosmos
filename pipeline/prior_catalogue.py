"""Traceable IRSA Gator cone queries for prior infrared photometry and variability."""
from __future__ import annotations
import argparse
import io
import json
from pathlib import Path
import requests
from astropy.table import Table
from probe_source import table_rows
from search_fields import ROOT,clean_json


def query(name,catalog,ra,dec,radius=15):
    out=ROOT/'data/work/discovery/prior'/name;out.mkdir(parents=True,exist_ok=True)
    url='https://irsa.ipac.caltech.edu/cgi-bin/Gator/nph-query'
    params=dict(catalog=catalog,spatial='cone',objstr=f'{ra} {dec}',radius=radius,radunits='arcsec',outfmt=3)
    result=dict(catalog=catalog,ra=ra,dec=dec,radius_arcsec=radius)
    try:
        r=requests.get(url,params=params,timeout=(10,60));r.raise_for_status()
        (out/f'{catalog}.xml').write_bytes(r.content)
        table=Table.read(io.BytesIO(r.content),format='votable')
        result.update(url=r.url,rows=table_rows(table))
    except Exception as e:result.update(error=str(e))
    (out/f'{catalog}.json').write_text(json.dumps(clean_json(result),indent=2))
    columns=('ra','dec','designation','SSTYSV_J','Var','CYvar','var_flg','w1mpro','w2mpro','w1sigmpro','w2sigmpro','cc_flags','ext_flg','dist')
    print(json.dumps(clean_json({**{k:v for k,v in result.items() if k!='rows'},'matches':len(result.get('rows',[])),
                               'summary':[{k:v for k,v in r.items() if k in columns} for r in result.get('rows',[])]}),indent=2),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('catalog');p.add_argument('ra',type=float);p.add_argument('dec',type=float);p.add_argument('--radius',type=float,default=15)
    a=p.parse_args();query(a.name,a.catalog,a.ra,a.dec,a.radius)
