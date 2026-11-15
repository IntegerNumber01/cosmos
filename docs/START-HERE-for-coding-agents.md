# COSMOS — START HERE for coding agents

## Read first
**COSMOS_v1_Plan_and_Data_2026-11-14.md** — the governing brief: ChatGPT's COSMOS v1 plan (Nov 14, 2026, "NASA Space Apps Guide" chat) plus the live-verified data audit behind it. Full plan text also lives in that ChatGPT chat. This project REPLACES FloodSight — ignore any NISAR/Nepal material.

## Locked decisions
- Challenge: Planet X and SPHEREx. Product: COSMOS, "Google Earth for the infrared universe."
- Data: SPHEREx **DR1 only**, via IRSA. **No login anywhere.** Access = SIA2 search + IBE cutouts + HiPS cube. **Never** depend on the SPHEREx Data Explorer UI (name resolver down, TAP jobs abort).
- Explore layer = HiPS all-sky cube (102 channels). **Skip frames 50/51 (blank).** HiPS has NO time axis — Time Travel uses dated Level-2 images only.
- Moving-object case: comet **C/2025 R2 (SWAN)** — 20 MOST-matched frames, Oct 27–28, 2025. NOT 3I/ATLAS (that is C/2025 N1).
- 3D = Gaia DR3 measured star distances only. SPHEREx has no depth per pixel. AI depth, if used at all, is labelled illustrative.
- No discovery claims. Predicted position ≠ detection. Hard stops are listed in the brief.
- Deadline: submit Sunday Nov 15, 2026 by 10:30 p.m. PT (official close 11:59 p.m.).

## Your first tasks (P0)
1. Fetch the Oct 2025 WISE 0855 D3 cutout (URL in the brief, §Verified data) with curl/wget; verify it is a real FITS file, not an HTML error page. The May 2025 cutout is already in this package (downloads/wise0855_may2025_d3_cutout.fits, verified FITS).
2. Re-run MOST for C/2025 R2 and download SWAN cutouts; check the comet is actually visible near the predicted positions. **2-hour proof window** — if SWAN is not measurable, move to fallback 2/3 in the brief and say so.
3. Decode the FITS planes (IMAGE/FLAGS/VARIANCE, WCS-WAVE) using the SPHEREx tutorial flag definitions — never invent flag bit meanings. Note: two D3 images are not automatically the same wavelength; check WCS-WAVE before differencing.

## Files in this package
- COSMOS_v1_Plan_and_Data_2026-11-14.md — governing brief (plan + audit + exact URLs)
- downloads/wise0855_may2025_d3_cutout.fits — real SPHEREx DR1 cutout, WISE 0855, May 2025, D3, OBSID 2025W19_1B_0116_1 (3.9 MB, FITS verified)
- downloads/barnard_sia2.csv — SIA2 result for the Barnard's Star field (5 rows, spherex_dr1). WARNING: query used J2000 reference coordinates — propagate to the observation epoch before any motion claim.

## Gate 0 when you start
PARTIAL PASS. Access solved (SIA2, cutouts, HiPS, MOST all verified live, no login). Unproven: SWAN visible/moving in pixels, epoch-pair alignment, Gaia sample, HiPS in-browser rendering. Those are your first deliverables.
