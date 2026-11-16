"""Every featured quick pick must finish motion analysis without archive/catalog APIs."""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3654"
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    errors, image_calls, local_failures = [], [], []
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
    def archive_down(route):
        image_calls.append(route.request.url)
        route.fulfill(status=502, json={"error": "Acceptance check: archive unavailable"})
    context.route("**/api/observations?**", archive_down)
    context.route("**/api/cutout?**", archive_down)
    context.route("**/api/known?**", lambda route: route.fulfill(status=502, json={"error": "Acceptance check: catalog unavailable"}))
    context.route("https://irsa.ipac.caltech.edu/**", lambda route: route.abort())
    page = context.new_page()
    page.on("response", lambda response: local_failures.append(response.url) if "/cache/" in response.url and response.status >= 400 else None)
    for slug in ["epsindib", "barnard", "wise0855", "rwaur", "rdra", "gy152", "gpmon", "swan"]:
        page.goto(BASE + "/timetravel?target=" + slug, wait_until="domcontentloaded", timeout=60000)
        page.get_by_role("button", name=re.compile(r"^Measure .+ on every date$")).click(timeout=60000)
        page.get_by_role("navigation", name="Measurement views").get_by_role("button", name="Motion", exact=True).click()
        motion = page.get_by_role("region", name="Motion analysis", exact=True)
        expect(motion.get_by_role("status")).not_to_be_visible(timeout=15000)
        expect(motion).not_to_contain_text("Motion analysis unavailable")
        expect(motion).not_to_contain_text("HTTP 502")
        report = json.loads((ROOT / f"web/public/cache/{slug}/motion_analysis.json").read_text(encoding="utf-8"))
        saved = next(s["result"] for s in report["selections"] if s["default"] and s["cadence"] == "exposures")
        if saved["ok"]:
            expect(motion).to_contain_text(f'{saved["shift"]:.2f} ± {saved["shiftError"]:.2f} arcseconds')
            expect(motion).to_contain_text("independent visits")
        else:
            expect(motion).to_contain_text(saved["reason"])
        if slug in ["epsindib", "barnard", "wise0855"]:
            motion.get_by_role("button", name="Compare a stack that follows this source", exact=True).click()
            expect(motion.get_by_role("img", name="Catalog-track stack", exact=True)).to_be_visible()
        print(f"PASS {slug}: local motion {'measurement' if saved['ok'] else 'quality refusal'}; no archive images requested", flush=True)
    assert not image_calls, image_calls
    assert not local_failures, local_failures
    assert not errors, errors
    browser.close()
