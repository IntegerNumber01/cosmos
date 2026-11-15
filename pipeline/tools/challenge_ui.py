"""Deterministic browser regression using real prepared SPHEREx cutouts.

Start the web app, then run:
  pipeline/.venv/Scripts/python pipeline/tools/challenge_ui.py http://localhost:3011

Archive failures are injected to test recovery; image pixels and metadata come from the repo cache.
"""
import json
import re
import pathlib
import struct
import sys
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3011"
ARTIFACTS = ROOT / "web/.qa"
ARTIFACTS.mkdir(exist_ok=True)
CACHE = ROOT / "web/public/cache/epsindib"
OBS = json.loads((CACHE / "observations.json").read_text())
BY_URL = {}
for file in (CACHE / "frames").glob("*.bin"):
    blob = file.read_bytes()
    length = struct.unpack_from("<I", blob)[0]
    meta = json.loads(blob[4:4 + length])
    BY_URL[meta["sourceFits"]] = blob

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce", permissions=["clipboard-read", "clipboard-write"])
    context.set_default_navigation_timeout(60000)
    errors = []
    context.on("page", lambda page: page.on("pageerror", lambda err: errors.append(str(err))))
    refresh_fails = [False]

    def cutout(route):
        url = parse_qs(urlparse(route.request.url).query)["url"][0]
        blob = BY_URL.get(url)
        route.fulfill(status=200, content_type="application/octet-stream", body=blob) if blob else route.fulfill(status=503, json={"error": "Unavailable test cutout"})

    def observations(route):
        if refresh_fails[0]:
            route.fulfill(status=503, json={"error": "Injected archive outage"})
        else:
            route.fulfill(json={**OBS, "schema": 2, "engine": "dr1-wcs-v2", "release": "dr1", "fieldSize": 0.1, "queried": "2026-11-15T06:00:00Z"})

    context.route("**/api/cutout?**", cutout)
    context.route("**/api/observations?**", observations)
    context.route("**/api/known?**", lambda route: route.fulfill(json={"query": {}, "gaia": {"ok": False}, "simbad": {"ok": False}, "small_bodies": {"ok": False}}))
    page = context.new_page()
    page.goto(BASE + "/timetravel?target=epsindib",wait_until="domcontentloaded")
    expect(page.get_by_role("button", name=re.compile(r"^Measure .+ on every date$"))).to_be_visible(timeout=30000)
    page.get_by_role("button", name="Type sky coordinates or change search settings").click()
    expect(page.get_by_label("Playback cadence")).to_have_value("exposures")
    page.get_by_role("button", name="Swipe", exact=True).click()
    page.get_by_role("button", name="More image tools", exact=True).click()
    page.get_by_label("Quality overlay", exact=True).check()
    after = page.get_by_label("Later date", exact=True).input_value()
    page.get_by_role("button", name="Share this view", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Link copied")
    shared = page.url
    clone = context.new_page()
    clone.goto(shared, wait_until="domcontentloaded")
    expect(clone.get_by_label("Later date", exact=True)).to_have_value(after, timeout=30000)
    clone.get_by_role("button", name="More image tools", exact=True).click()
    expect(clone.get_by_label("Quality overlay", exact=True)).to_be_checked()
    assert parse_qs(urlparse(clone.url).query)["window"] == parse_qs(urlparse(shared).query)["window"]

    clone.get_by_role("button", name="Stack visits", exact=True).click()
    expect(clone.get_by_text("Combine exposures within a visit", exact=True)).to_be_visible()
    clone.get_by_label("Maximum visit span").select_option("120")
    clone.get_by_label("Subtract second − first").check()
    clone.get_by_role("button", name="Share this view", exact=True).click()
    stacked_link = clone.url
    stack_clone = context.new_page()
    stack_clone.goto(stacked_link, wait_until="domcontentloaded")
    expect(stack_clone.get_by_text("Combine exposures within a visit", exact=True)).to_be_visible(timeout=30000)
    expect(stack_clone.get_by_label("Maximum visit span")).to_have_value("120")
    expect(stack_clone.get_by_label("Subtract second − first")).to_be_checked()
    print("PASS: shared frames, wavelength window, quality, and visit stacks restore")

    page.get_by_role("button", name="About this search", exact=True).click()
    refresh_fails[0] = True
    page.get_by_role("button", name="Check for newer observations").click()
    expect(page.get_by_role("alert").filter(has_text="Refresh failed")).to_be_visible()
    expect(page.get_by_role("button", name=re.compile(r"^Measure .+ on every date$"))).to_be_visible()
    refresh_fails[0] = False
    page.get_by_role("button", name="Check for newer observations").click()
    expect(page.get_by_text("live from IRSA SIA2", exact=False)).to_be_visible()
    expect(page.get_by_role("button", name=re.compile(r"^Measure .+ on every date$"))).to_be_visible()
    print("PASS: refresh failure retains the investigation; success replaces observation metadata")

    # Keep only observations for which real cached cutouts exist, making the on-demand lab deterministic.
    context.route("**/cache/epsindib/observations.json", lambda route: route.fulfill(json={**OBS, "frames": [o for o in OBS["frames"] if o["url"] in BY_URL]}))
    lab = context.new_page()
    lab.goto(BASE + "/timetravel?target=epsindib",wait_until="domcontentloaded")
    lab.get_by_role("button", name="Open the wavelength lab", exact=True).click()
    expect(lab.get_by_role("button", name="Build colour pictures and spectrum")).to_be_visible(timeout=30000)
    lab.get_by_role("button", name="Build colour pictures and spectrum").click()
    expect(lab.get_by_role("button", name="Download spectrum CSV")).to_be_visible(timeout=30000)
    expect(lab.get_by_role("img", name="Exploratory aperture spectrum", exact=False)).to_be_visible()
    assert len(lab.locator("svg[aria-label^='Exploratory aperture spectrum'] circle").all()) > 0
    with lab.expect_download() as download:
        lab.get_by_role("button", name="Download spectrum CSV").click()
    download.value.save_as(ARTIFACTS / "spectrum.csv")
    assert "empirical_error_mJy" in (ARTIFACTS / "spectrum.csv").read_text()
    lab.screenshot(path=str(ARTIFACTS / "timetravel-desktop.png"), full_page=True)
    print("PASS: real cutouts generate detector views, spectrum with error bars, and CSV")

    # Browser state and layout must remain usable on a phone.
    mobile = context.new_page()
    mobile.set_viewport_size({"width": 390, "height": 844})
    mobile.goto(shared, wait_until="domcontentloaded")
    expect(mobile.get_by_label("Later date", exact=True)).to_be_visible(timeout=30000)
    overflow = mobile.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    assert not overflow, "Time Travel overflows the mobile viewport"
    mobile.screenshot(path=str(ARTIFACTS / "timetravel-mobile.png"), full_page=True)
    embed = context.new_page()
    embed.goto(shared + "&embed=1")
    expect(embed.get_by_label("Later date", exact=True)).to_be_visible(timeout=30000)
    expect(embed.locator("nav")).to_have_count(0)
    print("PASS: mobile layout and embedded investigation")
    assert not errors, errors
    print("PASS: no browser runtime errors")
    browser.close()
