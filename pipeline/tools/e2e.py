"""End-to-end regression of the Time Travel UI against a running server.
Usage: python e2e.py [base_url] [case ...]   cases: swan kapteyn barnard rdra epsindib wise0855 rwaur
Prints the chosen sequence, Find-changes candidates and the "is it known?" verdict for each case."""
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "http://localhost:3001"
CASES = {
    "swan": "/timetravel?target=swan",
    "kapteyn": "/timetravel?ra=77.98520&dec=-45.05951&pmra=6500.0&pmdec=-5700.0&epoch=2025.9&name=Kapteyn%27s%20Star&from=gaia",
    "barnard": "/timetravel?target=barnard",
    "rdra": "/timetravel?target=rdra",
    "epsindib": "/timetravel?target=epsindib",
    "wise0855": "/timetravel?target=wise0855",
    "rwaur": "/timetravel?target=rwaur",
}
want = [a for a in sys.argv[1:] if not a.startswith("http")] or ["swan", "kapteyn", "barnard"]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for name in want:
        pg = b.new_page(viewport={"width": 1440, "height": 1000})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE + CASES[name], wait_until="domcontentloaded")
        for _ in range(60):
            pg.wait_for_timeout(1500)
            if pg.get_by_text("Measure the target on every date").count():
                break
        print(f"===== {name}")
        try:
            print("  " + pg.locator("text=This sequence").locator("..").inner_text().split("\n")[1])
        except Exception as e:  # noqa: BLE001
            print("  (no sequence)", e)
            pg.close()
            continue
        if pg.get_by_role("button", name="Find changes →").count():
            pg.get_by_role("button", name="Find changes →").click()
            pg.wait_for_timeout(2500)
            btns = pg.locator("li button")
            for i in range(min(6, btns.count())):
                print("   ", btns.nth(i).inner_text().split("\n")[0][:90])
            pg.get_by_role("button", name="Play dates").click()
            pg.wait_for_timeout(400)
        pg.get_by_text("Measure the target on every date").click()
        pg.wait_for_timeout(9000)
        txt = pg.locator("text=Is it already known?").locator("..").inner_text().split("\n")
        print("  KNOWN:", next((t for t in txt if t.startswith(("Known", "No Gaia", "Catalogue"))), "?")[:170])
        panel = pg.locator("text=Investigate ·").locator("..").inner_text()
        for line in panel.split("\n"):
            if line.startswith(("Brightness", "No date", "Measured shift", "Saturation")) or "dates had a usable" in line:
                print("  " + line[:200])
        if errs:
            print("  PAGE ERRORS:", errs[:2])
        pg.close()
    b.close()
