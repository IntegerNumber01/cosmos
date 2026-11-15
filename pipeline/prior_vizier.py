"""Coordinate-based retrieval of published VizieR tables through the Harvard mirror."""
import argparse
import io
import json
import requests
from astropy.io.votable import parse
from probe_source import table_rows
from search_fields import ROOT,clean_json

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('catalog');p.add_argument('ra',type=float);p.add_argument('dec',type=float);a=p.parse_args()
    out=ROOT/'data/work/discovery/prior'/a.name;out.mkdir(parents=True,exist_ok=True)
    params={'-source':a.catalog,'-c':f'{a.ra} {a.dec}','-c.rs':10,'-out.all':1}
    result=dict(catalog=a.catalog,ra=a.ra,dec=a.dec,radius_arcsec=10)
    key=a.catalog.replace('/','_').replace('+','')
    try:
        r=requests.get('https://vizier.cfa.harvard.edu/viz-bin/votable',params=params,timeout=(10,60));r.raise_for_status()
        (out/f'{key}.xml').write_bytes(r.content)
        result.update(url=r.url,tables=[dict(id=t.ID,rows=table_rows(t.to_table())) for t in parse(io.BytesIO(r.content)).iter_tables()])
    except Exception as e:result['error']=str(e)
    (out/f'{key}.json').write_text(json.dumps(clean_json(result),indent=2));print(json.dumps(clean_json(result),indent=2))
