# 30-second demo: shot list

Record the real app (`npm run build && npm start`), 1920×1080, on a machine with a real GPU. Open each page once beforehand so the tiles and data are cached. Featured targets also load from the prepared cache.

| Time | Screen | Action | Voice-over / caption |
|---|---|---|---|
| 0–4 s | `/` landing | The Gaia starfield drifts; the globe crossfades from 0.85 to 4.5 µm. | "Most of the universe is invisible to our eyes." |
| 4–8 s | `/explore?target=orion` | Drag the wavelength ribbon across a few bands. | "NASA SPHEREx maps the whole sky in 102 infrared colours." |
| 8–12 s | `/fly` | Click **Kapteyn's Star** in the tour, let the camera glide in, then press **Time Travel this star**. | "Fly to a star, then travel through time." |
| 12–19 s | `/timetravel?target=epsindib` | The dates timeline appears; press ▶ to play six dates, a year apart. Then press **Measure the target on every date**. | "Every date SPHEREx looked, at the same wavelength. Epsilon Indi B moved 4.7 arcseconds, exactly as predicted." |
| 19–26 s | `/timetravel?target=swan` | **Find changes** → click change #1 → **Check known asteroids & comets**. | "What changed? Something faded. Is it known? NASA's JPL says: comet C/2025 R2 SWAN. A recovery, not a discovery." |
| 26–30 s | `/validation` | Scroll the results table. | "Tested on all five challenge targets, with honest answers. COSMOS: an infrared universe anyone can explore and investigate." |

Notes
- The JPL lookup takes 30–40 s. Trigger it before recording that shot, or cut the wait in editing. Never fake the result.
- `?clean=1` on `/explore` hides all UI, for B-roll.
- Keyboard: Explore ← → steps one channel; Time Travel's swipe slider responds to arrow keys.
