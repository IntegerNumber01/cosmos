# COSMOS: The Infrared Universe Explorer

**"Google Earth for the infrared universe"** · Challenge: Planet X and SPHEREx

## Problem
NASA's SPHEREx maps the entire sky in 102 infrared colours. Its observations live in FITS files, coordinate services and archive tools that take specialist knowledge to use. The infrared universe is public, but it isn't accessible.

## Solution
COSMOS is an interactive explorer built on real observations. It needs no astronomy software.

1. **Explore:** a zoomable full-sky map from the SPHEREx DR1 all-sky cube. One slider sweeps all 102 wavelengths (0.75–5 µm). Dust lanes fade, the Galactic bulge appears, and star-forming clouds light up. The blank dichroic channels and striping-affected wavelengths are labelled. Ten destinations are built in, and views can be shared by URL.
2. **Fly:** 59,218 stars placed in 3D by ESA Gaia DR3 parallaxes. Fly to Proxima Centauri or Epsilon Eridani and click any star for its Gaia source ID, distance ± uncertainty, colour and brightness. A star is named only when Gaia's measured position, distance and brightness all match it. Explore hands off to Fly: "Fly from here" faces the same direction in 3D.
3. **Time Travel:** the same patch of sky on 27 Oct 2025 and 1 May 2026, from the same detector, at wavelengths that agree within 0.004 µm. Swipe, blink or show a significance map. The stars stay. Comet SWAN is gone.
4. **Investigate:** a guided case file on comet C/2025 R2 (SWAN). It runs from the orbit prediction (IRSA MOST) to the pixels (20 real SPHEREx frames), to independent measurements (speed, direction, position offset, field-star control, vacancy test), to a verdict. An evidence inspector shows each frame's OBSID, detector, timestamp, wavelength, pipeline flags (read from the FITS header) and links to the original files.

## Results
- SWAN is detected in 20/20 frames at S/N 195–647. Measured speed is 9.1–10.1″/min against 9.2–10.0″/min predicted, with direction within 2°. Field stars move less than 0.8″.
- At a matched wavelength 186 days later, the comet's position is empty (flux falls by more than 99%).
- Verdict: **confirmed known-object match**. It's a recovery, not a discovery.

## Data
SPHEREx DR1 all-sky HiPS cube (doi:10.26131/IRSA679) · SPHEREx DR1 Level-2 spectral images via IRSA SIA2 + IBE cutouts (doi:10.26131/IRSA678) · IRSA Moving Object Search Tool · ESA Gaia DR3 (Gaia Archive TAP).

## Honesty
- SPHEREx records no depth per pixel, so 3D comes only from Gaia. The infrared backdrop in Fly is drawn at infinity.
- Time Travel uses dated Level-2 frames, never the time-averaged all-sky mosaic.
- Predicted positions are always shown separately from measured ones.
- Frames at different wavelengths are never differenced or combined into a spectrum. (This is why we did not use the WISE 0855 May/Nov pair: its wavelengths are 2.365 vs 1.629 µm.)
- No discovery claims.
- Caveats we found are kept visible in the app. The pipeline flags the moving comet as OUTLIER. A small along-track offset remains. Star residuals show up in the difference maps.

## Built with
Next.js 15, TypeScript, Tailwind, React Three Fiber / Three.js, Aladin Lite 3.8.2; Python 3.12 with Astropy, NumPy, SciPy, reproject and astropy-healpix.

## Mission
Make the infrared universe a place that anyone can explore, question, and understand.
