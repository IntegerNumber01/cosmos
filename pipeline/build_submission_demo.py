"""Package seven slides from real, locally checked app screenshots; no personal details.

Run browser checks first. Produces standalone HTML and a seven-page PDF; no upload.
"""
import base64
import html
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/demo"
OUT.mkdir(parents=True, exist_ok=True)
ART = ROOT / "web/.qa/submission"
ART.mkdir(parents=True, exist_ok=True)

# Optional fresh capture from the running local app. Catalogue outages stay visible;
# prepared real reference fields and image cutouts supply the measured examples.
if len(sys.argv) > 1:
    from playwright.sync_api import expect
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        context.route("**/api/known?**", lambda r: r.fulfill(status=503, json={"error": "Live catalogue unavailable during demo capture"}))
        page = context.new_page()
        base = sys.argv[1].rstrip("/")
        page.goto(base, wait_until="domcontentloaded", timeout=60000)
        preview = page.get_by_role("region", name="Try a real motion investigation", exact=True)
        expect(preview).to_contain_text("4.79", timeout=60000)
        preview.get_by_role("button", name="Later", exact=False).click()
        preview.screenshot(path=str(ART / "preview.png"), timeout=60000)
        page.goto(base + "/timetravel?target=epsindib&guide=1&mode=swipe", wait_until="domcontentloaded", timeout=60000)
        guide = page.get_by_role("region", name="Guided investigation")
        expect(guide.get_by_role("button", name="Measure this source", exact=False)).to_be_enabled(timeout=60000)
        page.screenshot(path=str(ART / "guide.png"), timeout=60000)
        guide.get_by_role("button", name="Measure this source", exact=False).click()
        page.get_by_role("navigation", name="Measurement views").get_by_role("button", name="Motion", exact=True).click()
        motion = page.get_by_role("region", name="Motion analysis", exact=True)
        expect(motion).to_contain_text("independent visits", timeout=60000)
        motion.locator("figure").first.screenshot(path=str(ART / "motion.png"), style="header{visibility:hidden!important}", timeout=60000)
        page.goto(base + "/timetravel?target=rwaur&guide=1&mode=swipe", wait_until="domcontentloaded")
        guide = page.get_by_role("region", name="Guided investigation")
        expect(guide.get_by_role("button", name="Measure this source", exact=False)).to_be_enabled(timeout=60000)
        guide.get_by_role("button", name="Measure this source", exact=False).click()
        summary = page.get_by_role("region", name="Measurement summary")
        expect(summary).to_contain_text("checked against", timeout=60000)
        summary.screenshot(path=str(ART / "brightness.png"), style="header{visibility:hidden!important}", timeout=60000)
        page.goto(base + "/learn/lab", wait_until="domcontentloaded")
        expect(page.get_by_role("region", name="Brightness evidence")).to_be_visible(timeout=30000)
        page.get_by_role("navigation", name="Activity cases").get_by_role("button", name="Case 3", exact=False).click()
        case = page.get_by_role("region", name="Case 3", exact=False)
        expect(case).to_contain_text("No calibrated brightness result", timeout=60000)
        case.get_by_role("region", name="Brightness evidence").screenshot(path=str(ART / "refusal.png"), style="header{visibility:hidden!important}", timeout=60000)
        transfer = page.get_by_role("region", name="Apply your reasoning", exact=True)
        transfer.get_by_role("button", name="Try the new investigation", exact=True).click()
        expect(transfer.get_by_role("region", name="New-case measurements")).to_contain_text("+130%", timeout=30000)
        transfer.get_by_role("region", name="New-case measurements").screenshot(path=str(ART / "transfer.png"), timeout=60000)
        browser.close()

slides = [
    ("COSMOS", "The sky changes.\nSee the evidence.",
     "Team Sol27 · NASA Space Apps 2026 · Planet X and SPHEREx.",
     ["For beginner students and astronomy clubs, with a facilitator.", "Measure a real change. Challenge a false alarm. Explain the evidence."],
     "web/.qa/submission/preview.png"),
    ("01 · Motion", "A real track,\nmeasured from pixels.",
     "Epsilon Indi B: 4.79 ± 0.59 arcseconds across five usable visits.",
     ["Native positions corrected against isolated Gaia reference stars.", "East: 4.20 ± 0.57 ″/yr. North: −2.37 ± 0.57 ″/yr; consistent with the catalogue.", "Catalogue parallax is an input. No new distance is claimed."],
     "web/.qa/submission/motion.png"),
    ("02 · Brightness", "A young star\ngets brighter.",
     "RW Aur: approximately 61% ± 6% brighter in the selected real-image pair.",
     ["Compare matched infrared wavelengths and the same native-pixel measurement method.", "Reference stars check whether the whole image changed calibration.", "Supported so far: one clean pair does not establish the physical cause."],
     "web/.qa/submission/brightness.png"),
    ("03 · False alarms", "A dramatic number\ncan be wrong.",
     "A blended field star previously appeared to fade by 54%. The calibrated result is now refused.",
     ["Overlapping starlight can imitate change despite a small statistical error.", "The real-data activity asks learners to explain their choice before revealing the checks.", "Supported, insignificant and unreliable are different conclusions."],
     "web/.qa/submission/refusal.png"),
    ("04 · Apply your reasoning", "Can you make\nthe case yourself?",
     "A new real-image investigation: GP Mon. Give a reason before revealing the key.",
     ["Explain the measured change, uncertainty, one limit and the next observation.", "Initial answers are preserved; four closed questions have a transparent key.", "A facilitator reviews the explanation. The score is not a measured learning gain."],
     "web/.qa/submission/transfer.png"),
    ("05 · Evidence", "Keep the reasoning\nwith the result.",
     "Readable reports and JSON preserve observations, uncertainties, failed checks and open questions.",
     ["Original image URLs, dates, wavelengths and native measurements.", "One-click verification of saved image/catalog checksums and recalculation of five results.", "Download input records and results; a refused blended-star measurement remains refused."],
     None),
    ("06 · Intended benefit", "Real observations.\nCareful conclusions.",
     "Designed to help a learner explain what changed, what could fool them and what to check next.",
     ["A printable 15–20 minute kit, with optional extensions, supports a facilitated investigation.", "Published method comparison: 229 additional stars selected; 48 accepted; median error 0.56″ before, 0.44″ corrected. 20 cases worsen.", "Independent learning gains, adoption and novel discoveries have not been established."],
     None),
]

pages = []
for i, (kicker, title, lead, points, screenshot) in enumerate(slides):
    if screenshot:
        image = ROOT / screenshot
        if not image.exists():
            raise SystemExit(f"Run browser checks first; missing {image}")
        visual = '<img alt="Actual COSMOS browser interface" src="data:image/png;base64,' + base64.b64encode(image.read_bytes()).decode() + '">'
    elif i == 5:
        visual = '<div class="report"><small>INVESTIGATION HANDOFF</small><h3>What changed?</h3><p>Measurement + uncertainty</p><h3>What could fool us?</h3><p>Checked · Caution · Problem · Not checked</p><h3>What remains unknown?</h3><p>Keep open questions and the next observation.</p><hr><p>Readable text · JSON · CSV · Original images</p></div>'
    else:
        visual = '<div class="report"><small>DATA AND REPRODUCIBILITY</small><h3>NASA SPHEREx DR1</h3><p>Spectral images · doi:10.26131/IRSA678<br>All-sky cube · doi:10.26131/IRSA679</p><h3>ESA Gaia DR3</h3><p>Reference-star astrometry and catalogue context.</p><h3>Inspect the evidence</h3><p>In COSMOS: Validation → Reproduce<br>Verify saved inputs and rerun five results.<br>Local consistency; not independent replication.</p><hr><p>Code, explanatory text and demo preparation assisted by OpenAI Codex. Original observations are archival data.</p></div>'
    pages.append(f'<section class="slide"><div class="copy"><div class="kicker">{html.escape(kicker)}</div><h1>{html.escape(title).replace(chr(10),"<br>")}</h1><p class="lead">{html.escape(lead)}</p><ul>' + ''.join(f'<li>{html.escape(p)}</li>' for p in points) + f'</ul></div><div class="visual">{visual}</div><footer><span>COSMOS · Planet X and SPHEREx · NASA Space Apps 2026</span><span>{i+1} / 7</span></footer></section>')

document = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>COSMOS · seven-slide project demo</title>
<style>
*{box-sizing:border-box}html{scroll-snap-type:y mandatory}body{margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,sans-serif}.slide{width:1280px;height:720px;padding:58px 58px 65px;display:grid;grid-template-columns:1fr 1fr;gap:38px;position:relative;page-break-after:always;break-after:page;overflow:hidden;scroll-snap-align:start}.slide:last-child{page-break-after:auto;break-after:auto}.kicker{color:#a1a1aa;letter-spacing:2px;text-transform:uppercase;font-size:15px;font-weight:bold}h1{font-size:54px;line-height:1.04;letter-spacing:-2px;margin:28px 0 22px}.lead{font-size:23px;line-height:1.4;color:#e4e4e7}ul{padding-left:20px;margin-top:26px}li{font-size:17px;line-height:1.48;margin:14px 0;color:#a1a1aa}.visual{display:flex;align-items:center;justify-content:center;min-height:0;border:1px solid #29292d;border-radius:20px;background:#101013;padding:18px;overflow:hidden}.visual img{width:100%;height:100%;object-fit:contain;border-radius:10px}.report{width:100%;padding:20px}.report small{font-size:12px;letter-spacing:2px;color:#a1a1aa}.report h3{font-size:22px;margin-top:24px}.report p{font-size:17px;line-height:1.4;color:#a1a1aa;overflow-wrap:anywhere}.report hr{border:0;border-top:1px solid #303036;margin-top:28px}footer{position:absolute;left:58px;right:58px;bottom:24px;display:flex;justify-content:space-between;font-size:12px;color:#71717a}@page{size:1280px 720px;margin:0}@media print{html{scroll-snap-type:none}.slide{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style>''' + ''.join(pages) + '''<script>addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=Math.round(scrollY/720)+(e.key==='ArrowRight'?1:-1);scrollTo(0,Math.max(0,Math.min(6,n))*720)}});</script></html>'''
(OUT / "COSMOS-demo.html").write_text(document, encoding="utf-8")
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.set_content(document, wait_until="load")
    assert page.locator("section.slide").count() == 7
    assert page.evaluate("Array.from(document.querySelectorAll('.copy,.report,.visual')).every(e=>e.scrollHeight<=e.clientHeight)")
    page.pdf(path=str(OUT / "COSMOS-demo.pdf"), print_background=True, prefer_css_page_size=True)
    page.screenshot(path=str(ROOT / "web/.qa/motion/demo-cover.png"))
    browser.close()
print("Wrote standalone seven-slide HTML and PDF for Sol27. Personal details remain outside the app; complete required submission identification separately.")
