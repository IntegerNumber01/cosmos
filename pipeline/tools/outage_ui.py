"""Verify the judge-facing walkthrough with both live archive API routes unavailable."""
import re
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3418'
OUT = Path(__file__).resolve().parents[2] / 'web/.qa'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    ctx.set_default_navigation_timeout(60000)
    errors, archive_calls = [], []
    ctx.on('page', lambda page: page.on('pageerror', lambda error: errors.append({'url': page.url, 'stack': error.stack})))

    def unavailable(route):
        archive_calls.append(route.request.url)
        route.fulfill(status=503, json={'error': 'Injected archive outage'})

    ctx.route('**/api/observations?**', unavailable)
    ctx.route('**/api/cutout?**', unavailable)
    ctx.route('**/api/known?**', lambda route: route.fulfill(status=503, json={'error': 'Injected catalogue outage'}))
    page = ctx.new_page()
    for slug in ['epsindib', 'barnard', 'wise0855', 'rwaur', 'rdra', 'gy152', 'gpmon', 'swan']:
        page.goto(BASE + '/timetravel?target=' + slug, wait_until='domcontentloaded')
        expect(page.get_by_role('button', name=re.compile(r'^Measure .+ on every date$'))).to_be_visible(timeout=30000)
        expect(page.get_by_text('not a complete observation history', exact=False)).to_be_visible()
        assert not archive_calls, archive_calls
        print('PASS prepared field with live archive unavailable:', slug, flush=True)

    page.goto(BASE + '/timetravel?ra=266.71577&dec=-30.44494', wait_until='domcontentloaded')
    recovery = page.get_by_role('button', name='Try the prepared Epsilon Indi B example')
    expect(recovery).to_be_visible(timeout=30000)
    expect(page.get_by_role('textbox').first).to_have_value('266.71577 -30.44494')
    expect(page.get_by_text("this failure doesn't tell us whether photos exist here", exact=False)).to_be_visible()
    recovery.click()
    expect(page.get_by_role('button', name='Measure Epsilon Indi B on every date')).to_be_visible(timeout=30000)
    assert len(archive_calls) == 1, archive_calls
    page.screenshot(path=str(OUT / 'outage-prepared-recovery.png'), full_page=True)
    print('PASS original failing coordinates retained; recovery opens a labelled real example', flush=True)

    page.goto(BASE + '/fly', wait_until='domcontentloaded')
    for visit in range(3):
        if visit:
            page.get_by_role('link', name='Fly', exact=True).click()
        page.get_by_role('button', name=re.compile(r"^Barnard's Star")).click(timeout=30000)
        handoff = page.get_by_role('link', name='Time Travel this star')
        expect(handoff).to_have_attribute('href', '/timetravel?target=barnard&from=gaia')
        if visit == 0:
            page.screenshot(path=str(OUT / 'fly-labels.png'))
        handoff.click()
        expect(page.get_by_role('button', name="Measure Barnard's Star on every date")).to_be_visible(timeout=30000)
    assert len(archive_calls) == 1, archive_calls
    print('PASS Gaia identity routes Barnard\'s Star to its prepared field during an outage', flush=True)

    ctx.add_init_script("localStorage.setItem('cosmos.explore.intro.v1', '1')")
    # A failed live map must also have a useful recovery route, with no unhandled SDK rejection.
    ctx.route('https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/**', lambda route: route.abort())
    # Use client navigation so delayed WebGL teardown errors remain observable in this document.
    page.evaluate("localStorage.setItem('cosmos.explore.intro.v1', '1')")
    page.get_by_role('link', name='Explore', exact=True).click()
    expect(page.get_by_text("Loading NASA's infrared map of the sky…", exact=True)).not_to_be_visible(timeout=30000)
    expect(page.get_by_role('link', name='Open saved dated photos instead')).to_be_visible()
    stops = page.get_by_role('radiogroup', name='Infrared colour').get_by_role('radio')
    stops.first.press('Space')
    expect(stops.first).to_have_attribute('aria-checked', 'true')
    stops.first.press('ArrowRight')
    expect(stops.nth(1)).to_have_attribute('aria-checked', 'true')
    expect(page.get_by_role('button', name='Play a tour through the infrared colours')).to_be_visible()
    advanced = page.get_by_role('button', name='⚙ Advanced', exact=True)
    advanced.press('Space')
    expect(advanced).to_have_attribute('aria-expanded', 'true')
    print('PASS Space activates buttons; arrow keys select and focus wavelength stops', flush=True)
    assert not errors, errors
    browser.close()
