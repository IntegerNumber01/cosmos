"""Browser verification of the fresh search case files and real prepared image sequences."""
import json
import re
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:3011'
OUT=ROOT/'web/.qa';OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=browser.new_context(viewport={'width':1440,'height':1050},reduced_motion='reduce')
    ctx.set_default_navigation_timeout(60000)
    errors=[]
    ctx.on('page',lambda page:page.on('pageerror',lambda err:errors.append(str(err))))
    # Catalogue services are intentionally offline here; no fabricated identity is supplied to the UI.
    ctx.route('**/api/known?**',lambda route:route.fulfill(json={'query':{},'gaia':{'ok':False,'error':'Offline UI verification'},'simbad':{'ok':False,'error':'Offline UI verification'},'small_bodies':{'ok':False,'error':'Offline UI verification'}}))
    page=ctx.new_page();page.goto(BASE+'/investigate/search',wait_until="domcontentloaded")
    expect(page.get_by_role('heading',name='What the search actually found')).to_be_visible()
    page.wait_for_function('Array.from(document.images).every(im=>im.complete && im.naturalWidth>0)')
    for href in ['/data/discovery/gy152.json','/data/discovery/gpmon.json','/data/discovery/asr7-spectrum.json','/data/discovery/prior-catalogues.json']:
        r=ctx.request.get(BASE+href);assert r.ok,(href,r.status);assert r.json()
    page.screenshot(path=str(OUT/'discovery-cases-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.reload(wait_until="domcontentloaded");page.wait_for_function('Array.from(document.images).every(im=>im.complete && im.naturalWidth>0)')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
    page.screenshot(path=str(OUT/'discovery-cases-mobile.png'),full_page=True)
    print('PASS: case file, five real-data figures, evidence downloads, and mobile layout')
    page.set_viewport_size({'width':1440,'height':1050})
    for slug,expected in [('gy152',4),('gpmon',2)]:
        page.goto(BASE+'/timetravel?target='+slug,wait_until="domcontentloaded")
        expect(page.get_by_role('button',name=re.compile(r'^Measure .+ on every date$'))).to_be_visible(timeout=30000)
        expect(page.get_by_text('not a complete observation history',exact=False)).to_be_visible()
        page.get_by_role('button',name=re.compile(r'^Measure .+ on every date$')).click()
        expect(page.get_by_text('These wavelengths span',exact=False)).to_be_visible(timeout=15000)
        assert page.locator('canvas').count()>0
        page.get_by_role('button',name='Swipe',exact=True).click()
        expect(page.get_by_label('Later date',exact=True)).to_be_visible()
        if slug=='gy152':
            expect(page.get_by_label('Earlier date',exact=True)).to_have_value('1')
            expect(page.get_by_label('Later date',exact=True)).to_have_value('2')
            page.get_by_label('Later date',exact=True).select_option('3')
            page.get_by_role('button',name='Share this view',exact=True).click()
            clone=ctx.new_page();clone.goto(page.url, wait_until="domcontentloaded")
            expect(clone.get_by_label('Later date',exact=True)).to_have_value('3',timeout=30000)
            clone.close()
            page.get_by_label('Later date',exact=True).select_option('2')
        page.get_by_role('button',name='More image tools',exact=True).click()
        page.get_by_label('Quality overlay',exact=True).check()
        page.screenshot(path=str(OUT/f'{slug}-viewer.png'),full_page=True)
        # The selected set is the real cached compatible sequence, not a mock image fixture.
        print('PASS:',slug,'prepared sequence, native measurements, wavelength warning, swipe and flags')
    browser.close()
    assert not errors,errors
    print('PASS: no browser runtime errors')
