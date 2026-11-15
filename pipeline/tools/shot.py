"""Headless screenshot helper: python shot.py URL OUT.png [wait_ms] [w] [h] [js-before-shot]"""
import sys, time
from playwright.sync_api import sync_playwright
url, out = sys.argv[1], sys.argv[2]
wait = int(sys.argv[3]) if len(sys.argv) > 3 else 6000
w = int(sys.argv[4]) if len(sys.argv) > 4 else 1440
h = int(sys.argv[5]) if len(sys.argv) > 5 else 900
js = sys.argv[6] if len(sys.argv) > 6 else None
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": w, "height": h})
    logs = []
    pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url) if "hips" in r.url else None)
    pg.goto(url, wait_until="domcontentloaded")
    pg.wait_for_timeout(wait)
    if js:
        pg.evaluate(js)
        pg.wait_for_timeout(wait)
    pg.screenshot(path=out, timeout=150000)
    b.close()
for l in logs[-25:]:
    print(l[:300])
tiles = [r for r in reqs if "Npix" in r or "Allsky" in r]
print("hips tile requests:", len(tiles))
for r in tiles[:6]:
    print("  ", r)
