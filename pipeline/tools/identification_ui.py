"""Real prepared identity/JPL answers with every live API returning 502."""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3656"
OUT = ROOT / "web/.qa/identity"
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    calls, errors = [], []
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
    def blocked(route):
        calls.append(route.request.url)
        route.fulfill(status=502, json={"error": "Acceptance check: all live services unavailable"})
    context.route("**/api/**", blocked)
    page = context.new_page()
    def check(slug, suffix="", comet=False):
        page.goto(BASE + "/timetravel?target=" + slug + suffix, wait_until="domcontentloaded", timeout=60000)
        if not suffix:
            page.get_by_role("button", name=re.compile(r"^Measure .+ on every date$")).click(timeout=60000)
        views = page.get_by_role("navigation", name="Measurement views")
        expect(views).to_be_visible(timeout=60000)
        summary = page.get_by_text("Is it already known?", exact=True).locator("..")
        expect(summary).to_contain_text("Using saved catalog answers", timeout=15000)
        expect(summary).not_to_contain_text("couldn't reach the star catalogs")
        expect(summary).not_to_contain_text("catalog check failed")
        summary.get_by_role("button", name="Check known asteroids & comets (NASA JPL)", exact=True).click()
        expect(summary).to_contain_text("Saved JPL answers used for this observation.", timeout=15000)
        expect(summary).not_to_contain_text("lookup failed")
        if comet:
            expect(summary).to_contain_text("C/2025 R2 (SWAN)")
        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Download evidence JSON", exact=True).click()
        file = OUT / (slug + ("-comet" if comet else "") + ".json")
        downloaded.value.save_as(file)
        evidence = json.loads(file.read_text(encoding="utf-8"))["catalogues"]
        assert evidence["stars"]["gaia"]["ok"] and evidence["stars"]["simbad"]["ok"]
        for kind in ["comets", "asteroids"]:
            assert evidence["smallBodies"][kind]["ok"]
            assert evidence["smallBodies"][kind]["lookupInfo"]["delivery"] == "prepared"
            assert evidence["smallBodies"][kind]["lookupInfo"]["file"]
        print("PASS", slug, "SWAN observation" if comet else "default", "star identities and both JPL checks; provenance exported", flush=True)
    if "--comet-only" not in sys.argv:
        for slug in ["epsindib", "barnard", "wise0855", "rwaur", "rdra", "gy152", "gpmon", "swan"]:
            check(slug)
    binary = (ROOT / "web/public/cache/swan/frames/2025W44_1A_0045_2D1_0.1.bin").read_bytes()
    meta = json.loads(binary[4:4 + int.from_bytes(binary[:4], "little")])
    epoch = meta["mjdAvg"]
    measurement = {"ra": 314.2453, "dec": -5.6884, "label": "SWAN on its observation date", "mjd": epoch}
    check("swan", "&" + urlencode({"measure": json.dumps(measurement)}), True)
    assert not calls, calls
    assert not errors, errors
    browser.close()
