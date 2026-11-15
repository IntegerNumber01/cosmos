"""Save SIMBAD's identifiers and bibliography for a named counterpart; no novelty verdict."""
import argparse
import json
from probe_source import tap
from search_fields import ROOT,clean_json

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('label');p.add_argument('main_id');p.add_argument('--schema',action='store_true');a=p.parse_args()
    main=a.main_id.replace("'","''");host='https://simbad.harvard.edu/simbad/sim-tap/sync'
    result=dict(main_id=a.main_id,host=host)
    if a.schema:
        print(json.dumps(tap(host,"SELECT table_name,column_name FROM TAP_SCHEMA.columns WHERE table_name IN ('has_ref','ref','basic')"),indent=2));raise SystemExit(0)
    for key,q in {
        'identifiers':f"SELECT id FROM ident JOIN basic ON oidref=oid WHERE main_id='{main}'",
        'references':f"SELECT ref.bibcode,ref.title,ref.doi FROM has_ref JOIN basic ON has_ref.oidref=basic.oid JOIN ref ON has_ref.oidbibref=ref.oidbib WHERE main_id='{main}'"
    }.items():
        try:result[key]=tap(host,q)
        except Exception as e:result[key]=dict(error=str(e))
    out=ROOT/'data/work/discovery/prior'/a.label;out.mkdir(parents=True,exist_ok=True)
    (out/'aliases.json').write_text(json.dumps(clean_json(result),indent=2));print(json.dumps(clean_json(result),indent=2))
