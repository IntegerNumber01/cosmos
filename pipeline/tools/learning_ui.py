"""Engineering acceptance checks for the real-data learning activity and evidence handoff.

These automated checks are not human participant sessions or learning outcomes.
"""
import json
import pathlib
import sys
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3533"
ART = ROOT / "web/.qa/learning"
ART.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    ctx.set_default_navigation_timeout(60000)
    errors, api_calls = [], []
    ctx.on("page", lambda page: page.on("pageerror", lambda err: errors.append(str(err))))

    def unavailable(route):
        api_calls.append(route.request.url)
        route.fulfill(status=503, json={"error": "Deliberately unavailable in acceptance test"})

    ctx.route("**/api/**", unavailable)
    ctx.route("**/cache/**/known*.json", lambda route: route.fulfill(status=404, json={}))
    ctx.route("**/cache/**/identity_*.json", lambda route: route.fulfill(status=404, json={}))
    page = ctx.new_page()
    page.goto(BASE + "/learn", wait_until="domcontentloaded")
    page.get_by_role("link", name="Try the three real cases", exact=True).click()
    expect(page.get_by_role("heading", name="Would you believe this change?", exact=True)).to_be_visible()
    choices = ["A brightness change is supported so far", "No clear brightness change at this precision", "The brightness measurement is unreliable"]
    titles = ["Case 1 · A young star", "Case 2 · A nearby brown dwarf", "Case 3 · A star with company"]
    links = []
    for i, (title, choice) in enumerate(zip(titles, choices)):
        case = page.get_by_role("region", name=title, exact=True)
        expect(case.get_by_role("region", name="Brightness evidence")).to_be_visible(timeout=30000)
        reveal = case.get_by_role("button", name="Reveal the explanation")
        expect(reveal).to_be_disabled()
        if i == 0:
            case.get_by_label(choices[2], exact=True).check()  # retain a deliberately incorrect initial answer
        else:
            case.get_by_label(choice, exact=True).check()
        expect(reveal).to_be_disabled()
        case.get_by_role("textbox", name="Why? Refer to a measurement or a failed check.", exact=True).fill(f"Initial reason for case {i + 1}.")
        reveal.click()
        explanation = case.get_by_role("region", name="Case explanation")
        expect(explanation).to_contain_text(choice)
        expect(case.get_by_role("textbox", name="Why? Refer to a measurement or a failed check.", exact=True)).to_be_disabled()
        case.get_by_role("textbox", name="What would you check next, and why?", exact=True).fill("Independent exposures, with matching wavelengths.")
        case.get_by_text("Inspect the original data and full tools", exact=True).click()
        links.append(case.get_by_role("link", name="Open this measurement in Time Travel").get_attribute("href"))
        expect(case.get_by_role("link", name="Original FITS", exact=False)).to_have_count(2)
        if i == 2:
            expect(case.get_by_role("region", name="Brightness evidence")).to_contain_text("neighboring star")
            expect(case).to_contain_text("not a current valid measurement")
        case.screenshot(path=str(ART / f"case-{i + 1}.png"))
        if i < 2:
            case.get_by_role("button", name="Try the next case").click()
    assert not api_calls, "The prepared activity must not need live archive/catalogue API requests"
    with page.expect_download() as download:
        page.get_by_role("button", name="Download my responses", exact=True).click()
    download.value.save_as(ART / "responses.json")
    responses = json.loads((ART / "responses.json").read_text(encoding="utf-8"))
    assert len(responses["cases"]) == 3
    assert responses["cases"][0]["choice"] == "unreliable", "Do not overwrite an initial answer with the expected answer"
    assert all(c["revealed"] and c["reason"] and c["next"] for c in responses["cases"])
    print("PASS: three real cases work with archive services blocked; reveal requires reasoning and preserves initial answers")

    # The exact blended source must survive navigation and continue to be refused.
    page.goto(BASE + links[2], wait_until="domcontentloaded")
    expect(page.get_by_role("region", name="Measurement summary")).to_contain_text("Not calibrated", timeout=45000)
    expect(page.get_by_role("region", name="Measurement summary")).to_contain_text("neighboring star")
    page.get_by_role("navigation", name="Measurement views").get_by_role("button", name="Evidence", exact=True).click()
    sheet = page.get_by_role("region", name="Evidence worksheet")
    expect(sheet.locator("[data-verdict]")).not_to_have_attribute("data-verdict", "supported")
    sheet.get_by_label("Your notes", exact=False).nth(4).fill("Use a sharper image to separate the neighbour.")
    with page.expect_download() as download:
        page.get_by_role("button", name="Download readable evidence", exact=True).click()
    download.value.save_as(ART / "blended-handoff.txt")
    handoff = (ART / "blended-handoff.txt").read_text(encoding="utf-8")
    assert "[Problem]" in handoff and "[Not checked]" in handoff
    assert "Use a sharper image" in handoff and "REOPEN THIS INVESTIGATION" in handoff
    assert "https://irsa.ipac.caltech.edu" in handoff
    with page.expect_download() as download:
        page.get_by_role("button", name="Download evidence JSON", exact=True).click()
    download.value.save_as(ART / "blended-evidence.json")
    report = json.loads((ART / "blended-evidence.json").read_text(encoding="utf-8"))
    assert report["calibration"]["ok"] is False
    assert report["worksheet"]["notes"][4] == "Use a sharper image to separate the neighbour."
    selected = parse_qs(urlparse(report["investigationUrl"]).query)["measure"][0]
    assert json.loads(selected)["label"].startswith("Blended control")
    clone = ctx.new_page()
    clone.goto(report["investigationUrl"], wait_until="domcontentloaded")
    expect(clone.get_by_role("region", name="Measurement summary")).to_contain_text("neighboring star", timeout=45000)
    page.screenshot(path=str(ART / "blended-restored.png"), full_page=False)
    print("PASS: selected blended source reopens exactly; readable and JSON reports retain the refusal, service failures and notes")

    page.goto(BASE + "/learn/kit", wait_until="domcontentloaded")
    expect(page.get_by_role("button", name="Print or save as PDF", exact=True)).to_be_visible()
    page.emulate_media(media="print")
    expect(page.get_by_role("navigation", name="Main navigation")).not_to_be_visible()
    page.pdf(path=str(ART / "investigation-kit.pdf"), format="A4", margin={"top": "12mm", "bottom": "12mm", "left": "12mm", "right": "12mm"})
    page.emulate_media(media="screen")
    page.screenshot(path=str(ART / "kit-desktop.png"), full_page=False)
    mobile = ctx.new_page()
    mobile.set_viewport_size({"width": 390, "height": 844})
    for path in ["/learn", "/learn/kit", "/learn/lab"]:
        mobile.goto(BASE + path, wait_until="domcontentloaded")
        if path.endswith("lab"):
            expect(mobile.get_by_role("region", name="Brightness evidence")).to_be_visible(timeout=30000)
        assert not mobile.evaluate("document.documentElement.scrollWidth > innerWidth"), path
        mobile.screenshot(path=str(ART / (path.replace("/", "-").strip("-") + "-mobile.png")), full_page=False)
    # Reloading does not claim to have retained answers; there is no silent server storage.
    mobile.reload(wait_until="domcontentloaded")
    expect(mobile.get_by_role("textbox", name="Why? Refer to a measurement or a failed check.", exact=True)).to_have_value("")
    assert not errors, errors
    print("PASS: kit prints to PDF, mobile pages fit, reload clears answers and no browser runtime errors occurred")
    browser.close()
