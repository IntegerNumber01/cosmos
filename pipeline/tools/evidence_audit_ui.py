"""Check browser recomputation and integrity refusals with live archive/catalog APIs blocked."""
import json
import pathlib
import sys
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding='utf-8')
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:3759'
ART=ROOT/'web/.qa/evidence-audit'
ART.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch()
    ctx=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    ctx.route('**/api/**',lambda r:r.fulfill(status=502,json={'error':'Live providers blocked for audit test'}))
    page=ctx.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/validation#reproduce',wait_until='domcontentloaded')
    audit=page.get_by_role('region',name='Reproduce the headline evidence',exact=True)
    audit.get_by_role('button',name='Verify files and reproduce results',exact=True).click()
    result=audit.get_by_role('region',name='Reproduced evidence results',exact=True)
    expect(result).to_be_visible(timeout=60000)
    expect(result).to_contain_text('4.79 ± 0.59 arcsec')
    expect(result).to_contain_text('No significant brightness change')
    expect(result).to_contain_text('Refused:')
    assert result.locator(':scope > ul > li').count()==5
    with page.expect_download() as download:
        result.get_by_role('button',name='Download reproduced evidence and checksums',exact=True).click()
    path=ART/'reproduced-evidence.json';download.value.save_as(path)
    report=json.loads(path.read_text(encoding='utf-8'))
    assert len(report['cases'])==5 and all(i['manifestMatch'] for i in report['inputs'] if i.get('originalFits'))
    assert all(c['files'] for c in report['cases'])
    page.screenshot(path=str(ART/'reproduced-desktop.png'),full_page=True)
    print('PASS: five real calculations, retained refusal, verified inputs and JSON download with live APIs blocked',flush=True)

    def changed(route):
        relative=route.request.url.split('/cache/')[1]
        b=bytearray((ROOT/'web/public/cache'/relative).read_bytes()); b[-1]^=1
        route.fulfill(status=200,content_type='application/octet-stream',body=bytes(b))
    ctx.route('**/cache/epsindib/frames/**',changed)
    audit.get_by_role('button',name='Verify and calculate again',exact=True).click()
    expect(audit.get_by_role('alert')).to_contain_text('Checksum mismatch',timeout=30000)
    expect(audit.get_by_role('button',name='Download reproduced evidence and checksums',exact=True)).to_have_count(0)
    expect(result).to_have_count(0)
    ctx.unroute('**/cache/epsindib/frames/**',changed)
    audit.get_by_role('button',name='Verify files and reproduce results',exact=True).click()
    expect(result).to_be_visible(timeout=60000)
    print('PASS: a changed science byte removes the old report and fails explicitly; retry recovers',flush=True)

    page.set_viewport_size({'width':390,'height':844})
    audit.scroll_into_view_if_needed()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    audit.screenshot(path=str(ART/'reproduced-mobile.png'))
    assert not errors,errors
    print('PASS: mobile layout and no browser runtime errors',flush=True)
    browser.close()
