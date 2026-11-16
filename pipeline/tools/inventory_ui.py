"""Optional network acceptance: partial saved search plus real AWS pixels at a new position.
No cached image can cover this coordinate. A server search outage is injected; actual cutouts
still pass through the production API and NASA's original archive/mirror.
"""
import json
import pathlib
import re
import subprocess
import sys
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3758'
ART = ROOT / 'web/.qa/inventory'
ART.mkdir(parents=True, exist_ok=True)
code = """require('./scripts/register-ts.cjs');
global.fetch=async()=>new Response('Injected archive outage',{status:502});
const {NextRequest}=require('next/server'),{GET}=require('./src/app/api/observations/route.ts');
GET(new NextRequest('http://localhost/api/observations?ra=331.8&dec=-56.7')).then(async r=>console.log(JSON.stringify(await r.json())));
"""
data = json.loads(subprocess.check_output(['node', '-e', code], cwd=ROOT/'web', text=True))
assert data['inventoryFallback'] and len(data['frames']) > 100
with sync_playwright() as p:
    browser=p.chromium.launch()
    ctx=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    page=ctx.new_page()
    errors=[]; cutouts=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def observations(route):
        if 'refresh=1' in route.request.url:
            route.fulfill(status=502,json={'error':'Live archive unavailable'})
        else:
            route.fulfill(status=200,json=data)
    ctx.route('**/api/observations?**',observations)
    ctx.route('**/api/known?**',lambda route:route.fulfill(status=502,json={'error':'Catalog services unavailable'}))
    page.on('response',lambda r:cutouts.append({'url':r.url,'status':r.status}) if '/api/cutout?' in r.url else None)
    page.goto(BASE+'/timetravel?ra=331.8&dec=-56.7&gaia=0',wait_until='domcontentloaded')
    expect(page.get_by_text('These dates come from a partial saved NASA detector-footprint inventory',exact=False)).to_be_visible(timeout=30000)
    expect(page.get_by_role('button',name=re.compile(r'^Measure .+ on every date$'))).to_be_visible(timeout=120000)
    page.get_by_role('button',name='About this search',exact=True).click()
    expect(page.get_by_text('The latest live archive search failed.',exact=False)).to_be_visible()
    expect(page.get_by_role('link',name='Original footprint inventory and provenance',exact=False)).to_have_attribute('href','/data/exposure-index.json')
    page.get_by_role('button',name='Check for newer observations',exact=True).click()
    expect(page.get_by_text('Live archive unavailable',exact=False)).to_be_visible(timeout=15000)
    expect(page.get_by_role('button',name=re.compile(r'^Measure .+ on every date$'))).to_be_visible()
    assert len(cutouts)>1 and all(r['status']==200 for r in cutouts),cutouts
    assert not errors,errors
    page.screenshot(path=str(ART/'new-coordinate.png'),full_page=True)
    (ART/'result.json').write_text(json.dumps({'coordinate':[331.8,-56.7],'indexedFrames':len(data['frames']),'cutouts':cutouts,'runtimeErrors':errors},indent=2))
    print('PASS: original partial footprints, real new-coordinate cutouts, provenance, explicit refresh failure and no browser errors',flush=True)
    browser.close()
