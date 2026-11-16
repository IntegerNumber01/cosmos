"""Browser acceptance checks for the beginner-to-advanced investigation.

Uses shipped real cutouts. External catalogue services are deliberately unavailable;
the test must retain this as missing information, never as an empty catalogue.
"""
import csv
import io
import json
import pathlib
import sys
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3417"
ART = ROOT / "web/.qa/guided"
ART.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce", permissions=["clipboard-read", "clipboard-write"])
    ctx.set_default_navigation_timeout(60000)
    errors = []
    ctx.on("page", lambda page: page.on("pageerror", lambda err: errors.append(str(err))))
    ctx.route("**/api/known?**", lambda route: route.fulfill(status=503, json={"error": "Catalogue services deliberately offline in acceptance check"}))
    # Do not turn a prepared identity into a fabricated successful catalogue lookup.
    ctx.route("**/cache/**/known*.json", lambda route: route.fulfill(status=404, json={}))

    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    expect(page.get_by_role("link", name="See a real change", exact=False)).to_have_attribute("href", "/timetravel?target=rwaur&guide=1&mode=swipe")
    page.screenshot(path=str(ART / "home-desktop.png"))
    page.get_by_role("link", name="See a real change", exact=False).click()
    guide = page.get_by_role("region", name="Guided investigation")
    expect(guide.get_by_role("button", name="Compare the pictures", exact=False)).to_be_enabled(timeout=45000)
    expect(page.get_by_label("Earlier date", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Type sky coordinates or change search settings")).not_to_be_visible()
    expect(page.locator("p:visible").filter(has_text="This selected subset works without the archive")).to_be_visible()
    expect(page.get_by_role("region", name="Magnified target comparison")).to_be_visible()
    page.screenshot(path=str(ART / "guided-desktop.png"), full_page=True)
    guide.get_by_role("button", name="Measure this source", exact=False).click()
    summary = page.get_by_role("region", name="Measurement summary")
    expect(summary).to_be_visible()
    expect(summary).to_contain_text("brighter")
    # reference-star calibration runs from the prepared 12' cutouts and Gaia field, even with catalogue services down
    expect(summary).to_contain_text("checked against", timeout=60000)
    calibrated = summary.locator("dd").first.inner_text()
    assert "± " in calibrated and "brighter" in calibrated and "Not calibrated" not in calibrated, calibrated
    summary.get_by_role("button", name="How the brightness was checked").click()
    expect(summary).to_contain_text("Δm = −0.52")
    page.screenshot(path=str(ART / "calibrated-brightness.png"), full_page=True)
    print("PASS: calibrated headline:", calibrated)
    expect(page.get_by_text("We cannot tell whether this source is already known from this lookup", exact=False)).to_be_visible(timeout=30000)
    print("PASS: homepage starts a real guided brightness investigation; unavailable catalogues remain unavailable")

    # evidence worksheet: filled from checks that ran; an unavailable catalogue stays "not checked"
    sheet = page.get_by_role("region", name="Evidence worksheet")
    expect(sheet.locator("[data-verdict]")).to_contain_text("Supported so far")
    checks = sheet.get_by_role("list", name="Alternative explanations").locator("li")
    expect(checks).to_have_count(8)
    expect(checks.filter(has_text="whole image being brighter")).to_contain_text("Checked")
    expect(checks.filter(has_text="already catalogued")).to_contain_text("Not checked")
    expect(checks.filter(has_text="spectral feature")).to_contain_text("Not checked")
    sheet.get_by_label("Your notes", exact=False).nth(4).fill("Compare a D2 set at 1.1 um.")
    sheet.screenshot(path=str(ART / "worksheet.png"))
    print("PASS: worksheet verdict, eight explanations with honest statuses, and notes")

    with page.expect_download() as downloaded:
        page.get_by_role("button", name="Download evidence JSON", exact=True).click()
    report_file = ART / "rwaur-evidence.json"
    downloaded.value.save_as(report_file)
    report = json.loads(report_file.read_text(encoding="utf-8"))
    assert report["worksheet"]["verdict"]["level"] == "supported"
    assert report["worksheet"]["notes"][4] == "Compare a D2 set at 1.1 um."
    assert report["calibration"]["ok"] is True and abs(report["calibration"]["last"]["dmag"] + 0.53) < 0.1
    assert report["release"] == "SPHEREx DR1"
    rows = [r for r in report["measurements"] if r["usableForBrightness"]]
    assert len(rows) >= 2
    assert 1.4 < rows[-1]["flux"] / rows[0]["flux"] < 1.9, "Real RW Aur brightening should agree with the established control"
    assert all("/dr1/" in r["sourceFits"] and r["fluxErrEmp"] > 0 for r in rows)
    assert report["catalogues"]["error"] and report["catalogues"]["stars"] is None
    assert report["catalogues"]["smallBodies"]["status"] == "not_requested"
    assert "guide=1" in report["investigationUrl"] and report["limitations"]
    with page.expect_download() as downloaded:
        page.get_by_role("button", name="Download measurements CSV", exact=True).click()
    csv_file = ART / "rwaur-measurements.csv"
    downloaded.value.save_as(csv_file)
    exported = list(csv.DictReader(io.StringIO(csv_file.read_text(encoding="utf-8"))))
    assert len(exported) == len(report["measurements"])
    assert exported[0]["source_fits"] == report["measurements"][0]["sourceFits"]
    assert exported[0]["empirical_error_MJy_sr_pixel"] and exported[0]["limitations"]
    summary.screenshot(path=str(ART / "brightness-summary.png"))
    print("PASS: evidence downloads retain native measurements, errors, source URLs, service failures and limits")

    page.get_by_role("button", name="Share this comparison", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Link copied")
    shared = page.url
    clone = ctx.new_page()
    clone.goto(shared, wait_until="domcontentloaded")
    expect(clone.get_by_role("region", name="Guided investigation").get_by_role("button", name="Compare the pictures", exact=False)).to_be_enabled(timeout=30000)
    assert parse_qs(urlparse(clone.url).query)["guide"] == ["1"]
    assert parse_qs(urlparse(clone.url).query)["window"] == parse_qs(urlparse(shared).query)["window"]
    clone.get_by_role("button", name="Show all observation controls", exact=True).click()
    clone.get_by_role("button", name="Type sky coordinates or change search settings", exact=True).click()
    expect(clone.get_by_label("Sky coordinates (RA Dec)", exact=True)).to_be_visible()
    clone.get_by_role("button", name="Leave the guide", exact=True).click()
    expect(clone.get_by_role("region", name="Guided investigation")).to_have_count(0)
    assert "guide" not in parse_qs(urlparse(clone.url).query)
    print("PASS: sharing restores the guided comparison; expert controls and leaving the guide work")

    page.goto(BASE + "/timetravel?target=epsindib&guide=1&mode=swipe", wait_until="domcontentloaded")
    expect(page.get_by_role("region", name="Guided investigation").get_by_role("button", name="Measure this source", exact=False)).to_be_enabled(timeout=30000)
    page.get_by_role("region", name="Guided investigation").get_by_role("button", name="Measure this source", exact=False).click()
    expect(page.get_by_role("region", name="Measurement summary")).to_contain_text("Measured shift")
    with page.expect_download() as downloaded:
        page.get_by_role("button", name="Download evidence JSON", exact=True).click()
    downloaded.value.save_as(ART / "epsindib-evidence.json")
    motion = json.loads((ART / "epsindib-evidence.json").read_text(encoding="utf-8"))
    assert motion["target"]["pm"] and len(motion["measurements"]) >= 2
    page.screenshot(path=str(ART / "motion-measurements.png"), full_page=True)
    print("PASS: real motion example retains measured positions and separately labelled catalogue prediction")

    mobile = ctx.new_page()
    mobile.set_viewport_size({"width": 390, "height": 844})
    for path in ("/learn", "/timetravel?target=rwaur&guide=1&mode=swipe"):
        mobile.goto(BASE + path, wait_until="domcontentloaded")
        if "/timetravel" in path:
            expect(mobile.get_by_role("region", name="Guided investigation").get_by_role("button", name="Measure this source", exact=False)).to_be_enabled(timeout=30000)
            mobile.get_by_role("region", name="Guided investigation").get_by_role("button", name="Measure this source", exact=False).click()
            expect(mobile.get_by_role("region", name="Measurement summary")).to_be_visible()
            name = "guided-mobile"
        else:
            mobile.get_by_text("Why not just subtract any two pictures?", exact=True).click()
            expect(mobile.get_by_text("A star can be bright in one infrared colour", exact=False)).to_be_visible()
            name = "learn-mobile"
        assert not mobile.evaluate("document.documentElement.scrollWidth > innerWidth"), path + " overflows on mobile"
        mobile.screenshot(path=str(ART / (name + ".png")), full_page=True)
    assert not errors, errors
    print("PASS: lessons, mobile layouts, expandable explanations and no browser runtime errors")
    browser.close()
