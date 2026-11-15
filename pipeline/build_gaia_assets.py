"""Gaia DR3 -> compact browser assets for the 3D 'Fly' layer.

Every position is MEASURED: Gaia DR3 RA/Dec (epoch J2016.0) and distance = 1/parallax, kept
only where parallax_over_error is high (>10 for the 50 pc sample, >5 for bright stars).
Binary layout (little-endian float32, N stars, 8 values each):
  x, y, z [pc, ICRS Cartesian], abs_mag_G, phot_g_mean_mag, bp_rp (NaN->-99), parallax [mas], parallax_error [mas]
Plus uint32 pairs (hi, lo) of Gaia DR3 source_id, and stars.json (metadata + labels).
Famous-star labels are attached ONLY when a Gaia source matches the star's catalogue position
(within 0.1 deg, allowing for proper motion) - stars without a match get no label.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from astropy.table import Table

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/data/gaia"
OUT.mkdir(parents=True, exist_ok=True)

t = Table.read(ROOT / "data/raw/gaia/gaia_dr3_sample.ecsv")
plx = np.asarray(t["parallax"], float)
ok = np.isfinite(plx) & (plx > 0)
t = t[ok]
ra = np.radians(np.asarray(t["ra"], float))
dec = np.radians(np.asarray(t["dec"], float))
plx = np.asarray(t["parallax"], float)
eplx = np.asarray(t["parallax_error"], float)
d = 1000.0 / plx
x = d * np.cos(dec) * np.cos(ra)
y = d * np.cos(dec) * np.sin(ra)
z = d * np.sin(dec)
G = np.asarray(t["phot_g_mean_mag"], float)
absG = G + 5 * np.log10(plx) - 10
bprp = np.asarray(t["bp_rp"].filled(np.nan) if hasattr(t["bp_rp"], "filled") else t["bp_rp"], float)
good = np.isfinite(G)
t, x, y, z, G, absG, bprp, plx, eplx, d = (a[good] for a in (t, x, y, z, G, absG, bprp, plx, eplx, d))
n = len(t)
arr = np.stack([x, y, z, absG, G, np.where(np.isfinite(bprp), bprp, -99), plx, eplx], axis=1).astype("<f4")
(OUT / "stars.f32").write_bytes(arr.tobytes())
sid = np.asarray(t["SOURCE_ID"], dtype=np.uint64)
ids = np.stack([(sid >> np.uint64(32)).astype(np.uint32), (sid & np.uint64(0xFFFFFFFF)).astype(np.uint32)], axis=1).astype("<u4")
(OUT / "ids.u32").write_bytes(ids.tobytes())

teff = np.asarray(t["teff_gspphot"].filled(np.nan) if hasattr(t["teff_gspphot"], "filled") else t["teff_gspphot"], float)
ruwe = np.asarray(t["ruwe"].filled(np.nan) if hasattr(t["ruwe"], "filled") else t["ruwe"], float)

# Famous stars: (name, RA J2000 deg, Dec J2000 deg, approx V mag, approx distance pc).
# A label is attached only if a Gaia source lies within 0.1 deg (proper motion since J2000) AND its
# measured distance agrees within 15% AND |G - V| < 3.5 (red dwarfs are brighter in G than V).
# This rejects e.g. bright stars that Gaia's sample lacks, whose faint neighbours would otherwise match.
FAMOUS = [
    ("Proxima Centauri", 217.4289, -62.6795, 11.13, 1.30), ("Alpha Centauri A", 219.9021, -60.8340, 0.01, 1.34),
    ("Alpha Centauri B", 219.8961, -60.8375, 1.33, 1.34), ("Barnard's Star", 269.4521, 4.6934, 9.51, 1.83),
    ("Wolf 359", 164.1203, 7.0147, 13.51, 2.41), ("Lalande 21185", 165.8341, 35.9699, 7.52, 2.55),
    ("Sirius A", 101.2872, -16.7161, -1.46, 2.64), ("Sirius B (white dwarf)", 101.2872, -16.7161, 8.44, 2.64),
    ("Epsilon Eridani", 53.2327, -9.4583, 3.73, 3.22), ("Tau Ceti", 26.0170, -15.9375, 3.50, 3.65),
    ("61 Cygni A", 316.7248, 38.7494, 5.21, 3.49), ("Procyon", 114.8255, 5.2250, 0.34, 3.51),
    ("Altair", 297.6958, 8.8683, 0.76, 5.13), ("Vega", 279.2347, 38.7837, 0.03, 7.68),
    ("Fomalhaut", 344.4127, -29.6222, 1.16, 7.70), ("Arcturus", 213.9153, 19.1824, -0.05, 11.26),
    ("Capella", 79.1723, 45.9980, 0.08, 13.1), ("Pollux", 116.3290, 28.0262, 1.14, 10.4),
    ("Castor", 113.6494, 31.8883, 1.58, 15.6), ("Aldebaran", 68.9802, 16.5093, 0.86, 20.0),
    ("Regulus", 152.0930, 11.9672, 1.35, 24.3), ("Spica", 201.2983, -11.1613, 0.97, 77.0),
    ("Antares", 247.3519, -26.4320, 1.06, 170.0), ("Betelgeuse", 88.7929, 7.4071, 0.42, 168.0),
    ("Rigel", 78.6345, -8.2016, 0.13, 264.0), ("Polaris", 37.9546, 89.2641, 1.98, 133.0),
    ("Achernar", 24.4285, -57.2368, 0.46, 43.0), ("Canopus", 95.9880, -52.6957, -0.74, 95.0),
    ("Kapteyn's Star", 77.9190, -45.0184, 8.85, 3.93), ("Luyten's Star", 111.8521, 5.2259, 9.87, 3.79),
    ("Ross 128", 176.9349, 0.8043, 11.13, 3.37), ("Teegarden's Star", 43.2541, 16.8814, 15.13, 3.83),
    ("TRAPPIST-1", 346.6224, -5.0414, 18.8, 12.4), ("Gliese 581", 229.8618, -7.7228, 10.57, 6.3),
    ("Mizar", 200.9814, 54.9254, 2.23, 25.0), ("Dubhe", 165.9320, 61.7510, 1.79, 37.7),
    ("Bellatrix", 81.2828, 6.3497, 1.64, 77.0), ("Alkaid", 206.8852, 49.3133, 1.86, 31.9),
    ("Denebola", 177.2649, 14.5721, 2.14, 11.0), ("Alphecca", 233.6720, 26.7147, 2.22, 23.0),
]
ra_deg = np.asarray(t["ra"], float)
de_deg = np.asarray(t["dec"], float)
labels = []
for name, r0, d0, vmag, dist in FAMOUS:
    sep = np.degrees(np.arccos(np.clip(
        np.sin(np.radians(de_deg)) * np.sin(np.radians(d0)) +
        np.cos(np.radians(de_deg)) * np.cos(np.radians(d0)) * np.cos(np.radians(ra_deg - r0)), -1, 1)))
    cand = np.where((sep < 0.1) & (np.abs(d - dist) / dist < 0.15) & (np.abs(G - vmag) < 3.5))[0]
    if len(cand) == 0:
        print("no consistent Gaia match (no label):", name)
        continue
    i = int(cand[np.argmin(G[cand])])  # brightest consistent candidate (K/M dwarfs are brighter in G than V)
    labels.append(dict(name=name, i=i, sep_deg=round(float(sep[i]), 4)))
    print(f"match {name:24s} G={G[i]:6.2f} (V~{vmag:5.2f}) d={d[i]:8.2f} pc (lit~{dist})  sep={sep[i]*3600:6.1f}\"")

meta = dict(
    n=n,
    stride=8,
    fields=["x_pc", "y_pc", "z_pc", "abs_mag_g", "phot_g_mean_mag", "bp_rp", "parallax_mas", "parallax_error_mas"],
    frame="ICRS Cartesian, parsecs, origin = Sun; Gaia DR3 epoch J2016.0",
    selection=["parallax > 20 mas (d < 50 pc) AND parallax_over_error > 10",
               "phot_g_mean_mag < 6.5 AND parallax_over_error > 5"],
    source="ESA Gaia DR3, gaiadr3.gaia_source via the ESA Gaia Archive TAP service (retrieved 2026-11-14)",
    max_distance_pc=float(d.max()),
    labels=labels,
    teff=[None if not np.isfinite(v) else round(float(v)) for v in teff],
    ruwe=[None if not np.isfinite(v) else round(float(v), 2) for v in ruwe],
)
(OUT / "stars.json").write_text(json.dumps(meta, separators=(",", ":")))
print("stars", n, "labels", len(labels), "bytes", arr.nbytes + ids.nbytes)
