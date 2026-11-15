"""Shared SPHEREx Level-2 helpers.

Flag bit meanings are read from each file's FLAGS header (MSKNnnnn / MSKMnnnn / MSKDnnnn
cards). Nothing about flag semantics is hard-coded except which documented names we
choose to treat as "reject" for photometry/astrometry.
"""
from __future__ import annotations

import re
import warnings
from dataclasses import dataclass, field

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning

warnings.simplefilter("ignore", FITSFixedWarning)

# Documented flag NAMES (from the FITS header) that indicate unreliable pixel values.
# SOURCE (pixel mapped to a known catalogued source) and FULLSAMPLE are informational.
REJECT_FLAG_NAMES = {
    "TRANSIENT", "OVERFLOW", "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD",
    "NONLINEAR", "PHANMISS", "PERSIST", "OUTLIER",
}
# Artifact flags we do not reject outright but always report when present.
WARN_FLAG_NAMES = {"DICHROIC", "CROSSTALK", "GHOST", "GHOST_FPA", "GHOST_EXT", "STREAK", "BLOOM", "SNOWBALL", "HALO"}


@dataclass
class L2Image:
    path: str
    image: np.ndarray
    flags: np.ndarray
    variance: np.ndarray
    zodi: np.ndarray
    wcs: WCS
    wave_wcs: WCS
    header: fits.Header
    flag_defs: dict = field(default_factory=dict)  # name -> (bitmask, description)

    @property
    def reject_mask(self) -> np.ndarray:
        bits = 0
        for name, (m, _) in self.flag_defs.items():
            if name in REJECT_FLAG_NAMES:
                bits |= m
        return ((self.flags & bits) != 0) | ~np.isfinite(self.image) | ~np.isfinite(self.variance)

    def flags_at(self, x: float, y: float, r: float = 3.0) -> list[str]:
        yy, xx = np.indices(self.flags.shape)
        sel = (xx - x) ** 2 + (yy - y) ** 2 <= r * r
        present = np.bitwise_or.reduce(self.flags[sel]) if sel.any() else 0
        return sorted(n for n, (m, _) in self.flag_defs.items() if present & m)

    def wavelength_at(self, x: float, y: float) -> tuple[float, float]:
        """Central wavelength and bandwidth (um) at 0-based cutout pixel (x, y) from WCS-WAVE."""
        wl, bw = self.wave_wcs.pixel_to_world_values(x, y)
        return float(wl), float(bw)


def parse_flag_defs(hdr: fits.Header) -> dict:
    defs = {}
    for k in hdr:
        m = re.match(r"MSKN(\d{4})$", k)
        if m:
            n = m.group(1)
            defs[hdr[k].strip()] = (int(hdr[f"MSKM{n}"]), str(hdr.get(f"MSKD{n}", "")).strip())
    return defs


def _wave_wcs(hdr: fits.Header, hdul) -> WCS:
    # The alternate 'W' WCS is a pure lookup table in raw detector coordinates; the
    # unkeyed SIP coefficients belong to the celestial WCS and must not be applied to it.
    import logging
    logging.getLogger("astropy").setLevel(logging.ERROR)
    w = WCS(hdr, fobj=hdul, key="W")
    w.sip = None
    return w


def load_l2(path) -> L2Image:
    with fits.open(path) as h:
        hdr = h["IMAGE"].header
        img = L2Image(
            path=str(path),
            image=h["IMAGE"].data.astype(np.float64),
            flags=h["FLAGS"].data.astype(np.int64),
            variance=h["VARIANCE"].data.astype(np.float64),
            zodi=h["ZODI"].data.astype(np.float64),
            wcs=WCS(hdr),
            wave_wcs=_wave_wcs(hdr, h),
            header=hdr.copy(),
            flag_defs=parse_flag_defs(h["FLAGS"].header),
        )
    return img
