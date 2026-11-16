"""Browser acceptance: decluttered views, real motion, known-track stack and honest exports."""
import json
import pathlib
import sys

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parents[2]
ART = ROOT / "web/.qa/motion"
ART.mkdir(parents=True, exist_ok=True)
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3651"

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    context.set_default_timeout(15000)
    errors = []
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
    context.route("**/api/known?**", lambda route: route.fulfill(status=503, json={"error": "Acceptance check: live catalogue unavailable"}))
    context.route("**/cache/**/known*.json", lambda route: route.fulfill(status=404, json={}))
    context.route("**/cache/**/identity_*.json", lambda route: route.fulfill(status=404, json={}))
    page = context.new_page()
    page.goto(BASE + "/timetravel?target=epsindib&guide=1&mode=swipe", wait_until="domcontentloaded", timeout=60000)
    guide = page.get_by_role("region", name="Guided investigation")
    expect(guide.get_by_role("button", name="Measure this source", exact=False)).to_be_enabled(timeout=60000)
    page.screenshot(path=str(ART / "guided-compact.png"), timeout=60000)
    guide.get_by_role("button", name="Measure this source", exact=False).click()
    summary = page.get_by_role("region", name="Measurement summary")
    expect(summary).to_be_visible()
    expect(page.get_by_role("region", name="Evidence worksheet")).not_to_be_visible()
    expect(page.get_by_label("Your notes", exact=False)).to_have_count(5)  # retained, hidden until requested
    page.get_by_role("navigation", name="Measurement views").get_by_role("button", name="Motion", exact=True).click()
    motion = page.get_by_role("region", name="Motion analysis", exact=True)
    expect(motion).to_contain_text("independent visits", timeout=60000)
    expect(motion).to_contain_text("Catalog parallax 270.66 mas")
    expect(motion).to_contain_text("4.79 ± 0.59 arcseconds")
    expect(motion.get_by_role("img", name="Measured sky track", exact=False)).to_be_visible()
    motion.screenshot(path=str(ART / "motion-track.png"))
    motion.get_by_role("button", name="Alignment, controls and fit details", exact=True).click()
    expect(motion).to_contain_text("shared reference controls")
    print("PASS: real reference-calibrated motion and catalogue-parallax input, with independent-visit fit and controls")

    motion.get_by_role("button", name="Compare a stack that follows this source", exact=True).click()
    stack = page.get_by_role("region", name="Tracking stack comparison")
    expect(stack.get_by_role("img", name="Catalog-track stack", exact=True)).to_be_visible(timeout=30000)
    expect(stack).to_contain_text("not proof of recovery")
    expect(stack).to_contain_text("contributing at each target-aperture pixel")
    with page.expect_download() as downloaded:
        stack.get_by_role("button", name="Download tracking comparison", exact=True).click()
    out = ART / "tracking.json"
    downloaded.value.save_as(out)
    report = json.loads(out.read_text(encoding="utf-8"))
    assert len(report["sourceFits"]) >= 2 and report["target"]["parallaxMas"] > 0
    assert "not a blind search" in report["method"]
    stack.screenshot(path=str(ART / "tracking-comparison.png"))
    print("PASS: known-track comparison shares image scale and exports provenance, coverage and limitations")

    with page.expect_download() as downloaded:
        page.get_by_role("button", name="Download evidence JSON", exact=True).click()
    out = ART / "motion-evidence.json"
    downloaded.value.save_as(out)
    saved = json.loads(out.read_text(encoding="utf-8"))
    assert saved["motionAnalysis"]["ok"] and saved["motionAnalysis"]["east"]
    assert saved["catalogues"]["error"]  # outage never becomes an empty successful catalogue
    assert saved["motionAnalysis"]["positions"][0]["references"]
    with page.expect_download() as downloaded:
        page.get_by_role("button", name="Download readable evidence", exact=True).click()
    text = ART / "motion-evidence.txt"
    downloaded.value.save_as(text)
    assert "REFERENCE-STAR MOTION ANALYSIS" in text.read_text(encoding="utf-8")
    guide.get_by_role("button", name="Review the evidence", exact=False).click()
    expect(page.get_by_role("region", name="Evidence worksheet")).to_be_visible()
    page.get_by_label("Your notes", exact=False).first.fill("Check independent exposures before accepting this interpretation.")
    page.get_by_role("navigation", name="Measurement views").get_by_role("button", name="Summary", exact=True).click()
    expect(page.get_by_role("region", name="Evidence worksheet")).not_to_be_visible()
    page.get_by_role("navigation", name="Measurement views").get_by_role("button", name="Evidence", exact=True).click()
    expect(page.get_by_label("Your notes", exact=False).first).to_have_value("Check independent exposures before accepting this interpretation.")
    print("PASS: readable/JSON exports retain measured motion and failed catalogues; view changes preserve notes")

    page.set_viewport_size({"width": 390, "height": 844})
    page.get_by_role("navigation", name="Measurement views").get_by_role("button", name="Motion", exact=True).click()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    motion.scroll_into_view_if_needed()
    page.screenshot(path=str(ART / "motion-mobile.png"), timeout=60000)
    assert not errors, errors
    print("PASS: compact guide, separated views, mobile layout and no browser runtime errors")
    browser.close()
