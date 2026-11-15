"""Shared helpers: paths, polite HTTP, TAP queries, target catalogue, astrometric propagation."""
from __future__ import annotations

import io
import json
import logging
import threading
import time
import warnings
from pathlib import Path

import numpy as np
import requests
from astropy.table import Table
from astropy.time import Time
from astropy.wcs import FITSFixedWarning

warnings.simplefilter("ignore", FITSFixedWarning)
logging.getLogger("astropy").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw/validation"
OUT_JSON = ROOT / "web/public/data/validation"
PIX_ARCSEC = 6.15

GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
# The primary CDS SIMBAD host returned HTTP 404 for every path on 2026-11-14; the CDS-operated
# Harvard mirror serves the same TAP service. Try the primary first.
SIMBAD_TAPS = ["https://simbad.cds.unistra.fr/simbad/sim-tap/sync", "https://simbad.harvard.edu/simbad/sim-tap/sync"]
SIA = "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+{ra:.6f}+{dec:.6f}+{r}&RESPONSEFORMAT=csv"

# IRSA asks for modest concurrency: never more than 3 requests in flight.
_IRSA_SEM = threading.Semaphore(3)
UA = {"User-Agent": "cosmos-validation/1.0 (python-requests)"}


def http_get(url: str, *, headers=None, timeout=180, tries=6, irsa=True, check=None) -> requests.Response:
    hdr = dict(UA)
    hdr.update(headers or {})
    last = None
    for attempt in range(tries):
        try:
            if irsa:
                with _IRSA_SEM:
                    r = requests.get(url, headers=hdr, timeout=timeout)
            else:
                r = requests.get(url, headers=hdr, timeout=timeout)
            if r.status_code in (200, 206) and (check is None or check(r)):
                return r
            last = f"HTTP {r.status_code}"
        except requests.RequestException as e:  # noqa: PERF203
            last = str(e)
        time.sleep(min(60, 5 * (attempt + 1)))
    raise RuntimeError(f"GET failed after {tries} tries: {url} ({last})")


def tap_query(url: str, adql: str, timeout=180, tries=4) -> Table:
    last = None
    for attempt in range(tries):
        try:
            r = requests.post(url, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="votable", QUERY=adql), headers=UA, timeout=timeout)
            if r.status_code == 200 and b"QUERY_STATUS\" value=\"ERROR" not in r.content:
                t = Table.read(io.BytesIO(r.content), format="votable")
                for c in list(t.colnames):
                    if c != c.lower():
                        t.rename_column(c, c.lower())
                return t
            last = f"HTTP {r.status_code}: {r.text[:300]}"
        except Exception as e:  # noqa: BLE001
            last = str(e)
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"TAP failed {url}: {last}")


def simbad_query(adql: str) -> tuple[Table, str]:
    err = None
    for u in SIMBAD_TAPS:
        try:
            return tap_query(u, adql, timeout=60, tries=2), u
        except RuntimeError as e:
            err = e
    raise RuntimeError(f"all SIMBAD TAP hosts failed: {err}")


# ---------------------------------------------------------------- targets

TARGETS = {
    "barnard": dict(name="Barnard's Star", test_type="proper_motion", gaia=4472832130942575872, simbad="NAME Barnard's star"),
    "wise0855": dict(name="WISE J085510.83-071442.5 (WISE 0855-0714)", test_type="detection_and_motion", gaia=None,
                     simbad="WISE J085510.83-071442.5"),
    "epsindib": dict(name="Epsilon Indi B (Ba+Bb, unresolved)", test_type="detection_and_motion", gaia=6412596012146801152,
                     simbad="* eps Ind B", neighbour_gaia=6412595290592307840, neighbour_name="eps Ind A"),
    "rwaur": dict(name="RW Aurigae (A+B, unresolved)", test_type="variability", gaia=156430822114424576, simbad="V* RW Aur",
                  companion_gaia=156430817820015232),
    "rdra": dict(name="R Draconis", test_type="variability", gaia=1648328016354496384, simbad="V* R Dra"),
}

GAIA_COLS = ("source_id, ra, dec, ra_error, dec_error, ref_epoch, pmra, pmra_error, pmdec, pmdec_error, parallax, parallax_error, "
             "radial_velocity, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, ruwe, phot_variable_flag")


def _row(t: Table, i=0) -> dict:
    out = {}
    for c in t.colnames:
        v = t[c][i]
        if np.ma.is_masked(v):
            out[c] = None
        elif isinstance(v, (bytes, np.bytes_)):
            out[c] = v.decode()
        elif isinstance(v, (np.integer,)):
            out[c] = int(v)
        elif isinstance(v, (np.floating, float)):
            out[c] = float(v)
        else:
            out[c] = str(v) if not isinstance(v, (int, float)) else v
    return out


def gaia_sources(ids) -> dict:
    t = tap_query(GAIA_TAP, f"SELECT {GAIA_COLS} FROM gaiadr3.gaia_source WHERE source_id IN ({','.join(str(i) for i in ids)})")
    return {int(t['source_id'][i]): _row(t, i) for i in range(len(t))}


def load_catalog(tid: str, refresh=False) -> dict:
    """Catalogue astrometry for a target. Cached in data/raw/validation/<tid>/catalog.json."""
    path = RAW / tid / "catalog.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    path.parent.mkdir(parents=True, exist_ok=True)
    T = TARGETS[tid]
    cat = dict(name=T["name"])
    name = T["simbad"].replace("'", "''")
    sb, host = simbad_query(
        "SELECT b.main_id, b.ra, b.dec, b.coo_err_maj, b.coo_err_min, b.coo_bibcode, b.pmra, b.pmdec, b.pm_err_maj, b.pm_err_min, "
        "b.pm_bibcode, b.plx_value, b.plx_err, b.plx_bibcode, b.rvz_radvel, b.otype "
        f"FROM basic b JOIN ident i ON i.oidref=b.oid WHERE i.id='{name}'")
    cat["simbad"] = dict(_row(sb), tap=host)
    ids = [T[k] for k in ("gaia", "neighbour_gaia", "companion_gaia") if T.get(k)]
    if ids:
        g = gaia_sources(ids)
        cat["gaia_dr3"] = g.get(T["gaia"]) if T["gaia"] else None
        if T.get("neighbour_gaia"):
            cat["neighbour"] = dict(name=T["neighbour_name"], gaia_dr3=g[T["neighbour_gaia"]])
        if T.get("companion_gaia"):
            cat["companion"] = dict(name="RW Aur B", gaia_dr3=g[T["companion_gaia"]])
    if cat.get("gaia_dr3"):
        a = cat["gaia_dr3"]
        cat["astrometry"] = dict(source=f"Gaia DR3 {a['source_id']}", ra=a["ra"], dec=a["dec"], epoch_jyear=2016.0,
                                 pmra=a["pmra"], pmra_err=a["pmra_error"], pmdec=a["pmdec"], pmdec_err=a["pmdec_error"],
                                 parallax=a["parallax"], parallax_err=a["parallax_error"], rv=a["radial_velocity"],
                                 pos_err_mas=[a["ra_error"], a["dec_error"]],
                                 ref="Gaia Collaboration 2023, A&A 674, A1 (Gaia DR3), via ESA Gaia TAP")
    else:
        s = cat["simbad"]
        # SIMBAD basic.ra/dec are ICRS at epoch J2000.0 (verified for Barnard's Star: SIMBAD's
        # position equals Gaia DR3 propagated from 2016.0 back to 2000.0).
        cat["astrometry"] = dict(source=f"SIMBAD {s['main_id']}", ra=s["ra"], dec=s["dec"], epoch_jyear=2000.0,
                                 pmra=s["pmra"], pmra_err=s["pm_err_maj"], pmdec=s["pmdec"], pmdec_err=s["pm_err_maj"],
                                 parallax=s["plx_value"], parallax_err=s["plx_err"], rv=s["rvz_radvel"],
                                 pos_err_mas=[s["coo_err_maj"], s["coo_err_min"]],
                                 ref=f"SIMBAD basic table (coords {s['coo_bibcode']}, pm {s['pm_bibcode']}, plx {s['plx_bibcode']})")
    path.write_text(json.dumps(cat, indent=1))
    return cat


# ---------------------------------------------------------------- astrometry

def earth_bary_au(t: Time) -> np.ndarray:
    from astropy.coordinates import get_body_barycentric
    p = get_body_barycentric("earth", t)
    return np.array([p.x.to_value("AU"), p.y.to_value("AU"), p.z.to_value("AU")])


def propagate(ra, dec, pmra, pmdec, plx, epoch_jyear, t: Time, earth=None):
    """Apparent (geocentric, astrometric) position at time t.

    Linear proper motion in the tangent plane from the catalogue epoch plus annual parallax
    from Earth's barycentric position. (Second-order terms are < 0.05" over a decade even for
    Barnard's Star.) Works on scalars or numpy arrays; pmra is mu_alpha* (mas/yr).
    """
    ra = np.asarray(ra, float)
    dec = np.asarray(dec, float)
    pmra = np.nan_to_num(np.asarray(pmra, float))
    pmdec = np.nan_to_num(np.asarray(pmdec, float))
    plx = np.nan_to_num(np.asarray(plx, float))
    dt = t.jyear - epoch_jyear
    E = earth_bary_au(t) if earth is None else earth
    a, d = np.radians(ra), np.radians(dec)
    dE = pmra * dt + plx * (E[0] * np.sin(a) - E[1] * np.cos(a))  # mas
    dN = pmdec * dt + plx * (E[0] * np.cos(a) * np.sin(d) + E[1] * np.sin(a) * np.sin(d) - E[2] * np.cos(d))
    return ra + dE / 3.6e6 / np.cos(d), dec + dN / 3.6e6


def target_position(cat: dict, t: Time):
    a = cat["astrometry"]
    return tuple(float(v) for v in propagate(a["ra"], a["dec"], a["pmra"], a["pmdec"], a["parallax"], a["epoch_jyear"], t))


def target_position_err_arcsec(cat: dict, t: Time) -> float:
    """1-sigma (per axis, approx.) catalogue error of the propagated position."""
    a = cat["astrometry"]
    dt = abs(t.jyear - a["epoch_jyear"])
    pos = max(x or 0 for x in a["pos_err_mas"])
    pm = max(a["pmra_err"] or 0, a["pmdec_err"] or 0)
    return float(np.hypot(pos, pm * dt) / 1000 + (a["parallax_err"] or 0) / 1000)


def offsets_arcsec(ra, dec, ra0, dec0):
    """(East, North) offsets of (ra,dec) from (ra0,dec0) in arcsec (small-angle)."""
    return (np.asarray(ra) - ra0) * np.cos(np.radians(dec0)) * 3600, (np.asarray(dec) - dec0) * 3600


def gaia_field(ra, dec, radius_deg, gmax=18.0) -> Table:
    return tap_query(GAIA_TAP,
                     f"SELECT {GAIA_COLS} FROM gaiadr3.gaia_source WHERE phot_g_mean_mag < {gmax} AND "
                     f"1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra},{dec},{radius_deg}))")
