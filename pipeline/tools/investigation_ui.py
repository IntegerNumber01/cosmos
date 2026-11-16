"""Browser acceptance of the motion-first path, transfer exercise and published benchmark.
Automated engineering verification, not a participant study or measured learning gain.
"""
import json
import pathlib
import sys
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[2]
ART = ROOT / 'web/.qa/investigation'
ART.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[1] if len(sys.argv)>1 else 'http://localhost:3755'
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    errors=[]; calls=[]
    ctx.on('page',lambda page:page.on('pageerror',lambda e:errors.append(str(e))))
    def unavailable(route):
        calls.append(route.request.url)
        route.fulfill(status=502,json={'error':'Live services unavailable in acceptance test'})
    ctx.route('**/api/**',unavailable)
    page=ctx.new_page()
    page.goto(BASE,wait_until='domcontentloaded',timeout=60000)
    preview=page.get_by_role('region',name='Try a real motion investigation',exact=True)
    expect(preview).to_contain_text('4.79',timeout=60000)
    expect(preview).to_contain_text('0.59')
    expect(preview.get_by_role('button',name='Blink dates',exact=True)).to_have_attribute('aria-pressed','false')
    earlier=preview.get_by_role('img').first.get_attribute('aria-label')
    preview.get_by_role('button',name='Later',exact=False).click()
    later=preview.get_by_role('img').first.get_attribute('aria-label')
    assert earlier!=later
    preview.get_by_role('button',name='Blink dates',exact=True).click()
    expect(preview.get_by_role('button',name='Pause blink',exact=True)).to_have_attribute('aria-pressed','true')
    preview.get_by_role('button',name='Pause blink',exact=True).click()
    assert not calls,'Homepage preview must recalculate using prepared files only'
    page.screenshot(path=str(ART/'home-desktop.png'))
    preview.screenshot(path=str(ART/'motion-preview.png'))
    page.get_by_role('link',name='Investigate a moving brown dwarf',exact=False).click()
    guide=page.get_by_role('region',name='Guided investigation',exact=True)
    expect(guide.get_by_role('button',name='Measure this source',exact=False)).to_be_enabled(timeout=60000)
    guide.get_by_role('button',name='Measure this source',exact=False).click()
    motion=page.get_by_role('region',name='Motion analysis',exact=True)
    expect(motion).to_be_visible(timeout=60000)
    expect(motion).to_contain_text('4.79',timeout=60000)
    expect(page.get_by_role('navigation',name='Measurement views').get_by_role('button',name='Motion',exact=True)).to_have_attribute('aria-pressed','true')
    motion.screenshot(path=str(ART/'guided-motion.png'))
    print('PASS: real homepage blink and motion-first guide recalculate the source with live APIs blocked',flush=True)

    page.goto(BASE+'/learn/lab#reasoning-check',wait_until='domcontentloaded')
    transfer=page.get_by_role('region',name='Apply your reasoning',exact=True)
    transfer.get_by_role('button',name='Try the new investigation',exact=True).click()
    expect(transfer.get_by_role('region',name='New-case measurements')).to_contain_text('+130%',timeout=30000)
    submit=transfer.get_by_role('button',name='Check my reasoning',exact=True)
    expect(submit).to_be_disabled()
    # Retain a wrong initial choice; never silently replace it with the answer key.
    transfer.get_by_label('It stayed constant at this precision',exact=True).check()
    transfer.get_by_label('Brightness alone does not answer whether it moved',exact=True).check()
    transfer.get_by_label('Its catalogue identity remains unchecked',exact=True).check()
    transfer.get_by_label('Collect independent, clean exposures at matching wavelengths',exact=True).check()
    expect(submit).to_be_disabled()
    transfer.get_by_role('textbox',name='Write your evidence handoff:',exact=False).fill('GP Mon brightened by about 130 percent with 27 percent uncertainty. Check a separate matched-wavelength exposure; the unresolved system may bias the reading.')
    submit.click()
    expect(transfer.get_by_role('region',name='Reasoning feedback')).to_contain_text('3 of 4')
    expect(transfer.get_by_role('textbox')).to_be_disabled()
    with page.expect_download() as d:
        transfer.get_by_role('button',name='Download my reasoning record',exact=True).click()
    d.value.save_as(ART/'reasoning-record.json')
    record=json.loads((ART/'reasoning-record.json').read_text(encoding='utf-8'))
    assert record['response']['choices']==[1,1,2,1]
    assert record['score']['correct']==3 and len(record['measurement']['sourceFits'])==2
    assert record['measurement']['calibration']['ok'] and 'target=gpmon' in record['measurement']['comparisonUrl']
    assert 'not a measured learning gain' in record['score']['note']
    assert len(record['facilitatorReview'])==4
    with page.expect_download() as d:
        transfer.get_by_role('button',name='Download readable reasoning',exact=True).click()
    d.value.save_as(ART/'reasoning-record.txt')
    readable=(ART/'reasoning-record.txt').read_text(encoding='utf-8')
    assert 'My answer: It stayed constant' in readable and 'GP Mon brightened' in readable
    assert 'ORIGINAL OBSERVATIONS' in readable and record['measurement']['sourceFits'][0] in readable
    transfer.screenshot(path=str(ART/'transfer-feedback.png'))
    print('PASS: a new real case requires reasoning, retains incorrect choices, and exports data plus a transparent assessment',flush=True)
    page.goto(BASE+'/validation#motion-benchmark',wait_until='domcontentloaded')
    benchmark=page.get_by_role('region',name='Reference-star benchmark',exact=True)
    expect(benchmark).to_contain_text('48 / 229',timeout=30000)
    expect(benchmark).to_contain_text('worsens 20')
    expect(benchmark.get_by_role('row')).to_have_count(9)
    benchmark.screenshot(path=str(ART/'benchmark.png'))
    print('PASS: published comparison includes all eight fields, refusals and worsened cases',flush=True)
    mobile=ctx.new_page();mobile.set_viewport_size({'width':390,'height':844})
    for path in ['','/learn','/learn/kit','/learn/lab','/validation#motion-benchmark']:
        mobile.goto(BASE+path,wait_until='domcontentloaded')
        if not path:expect(mobile.get_by_role('region',name='Try a real motion investigation')).to_contain_text('4.79',timeout=30000)
        assert not mobile.evaluate('document.documentElement.scrollWidth>innerWidth'),path
        mobile.screenshot(path=str(ART/('mobile-'+(path.split('#')[0].replace('/','-').strip('-')or'home')+'.png')))
    fail=ctx.new_page()
    fail.route('**/cache/epsindib/motion_analysis.json',lambda r:r.fulfill(status=503,body='unavailable'))
    fail.goto(BASE,wait_until='domcontentloaded')
    expect(fail.get_by_role('region',name='Try a real motion investigation').get_by_role('alert')).to_contain_text('could not be loaded',timeout=30000)
    expect(fail.get_by_role('region',name='Try a real motion investigation')).not_to_contain_text('4.79')
    fail.unroute('**/cache/epsindib/motion_analysis.json')
    fail.get_by_role('button',name='Retry the real images',exact=True).click()
    expect(fail.get_by_role('region',name='Try a real motion investigation')).to_contain_text('4.79',timeout=30000)
    assert not errors,errors
    print('PASS: mobile layout, explicit failure/retry and no browser runtime errors',flush=True)
    browser.close()
