# 30-second demo: a defensible investigation

A separate seven-slide alternative is available in [demo/COSMOS-demo.pdf](demo/COSMOS-demo.pdf) and its editable, standalone [HTML source](demo/COSMOS-demo.html). It uses real screenshots from the browser checks, leads with measured motion, and includes brightness, a refused false alarm, specified-track stacks and evidence handoff. It contains no personal details. Add any required team identification separately before submitting. Rebuild from captured screenshots with `pipeline/.venv/Scripts/python pipeline/build_submission_demo.py`, or pass a running local URL (for example `http://localhost:3652`) to capture fresh app images first.

Record the real app (`npm run build && npm start`), 1920×1080, on a machine with a real GPU. Open each page once beforehand so the tiles and data are cached. Featured targets also load from the prepared cache.

| Time | Screen | Action | Voice-over / caption |
|---|---|---|---|
| 0–4 s | `/learn/kit` | Show the question and the intended students/astronomy-club audience. | "Students see a difference in sky images. Can they trust it?" |
| 4–8 s | `/timetravel?target=rwaur&guide=1&mode=swipe` | Swipe the two real dates; keep dates and wavelength visible. | "COSMOS compares real NASA SPHEREx observations at matching wavelengths." |
| 8–13 s | RW Aur measurement | Show the calibrated headline and uncertainty. Preload this result. | "RW Aur brightens by 61 percent, plus or minus six." |
| 13–20 s | `/learn/lab`, case 3 | Show the historical −54% false alarm and the current neighbouring-star refusal. | "This dramatic fading was a false alarm: overlapping starlight. Our checks now refuse it." |
| 20–25 s | Time Travel worksheet / readable evidence | Show an open check, a note and the readable download. | "Record the reasoning, uncertainty and evidence for someone else to check." |
| 25–30 s | `/timetravel?target=epsindib&guide=1&mode=swipe` | Show the separately measured motion, then the learning-kit link. | "Explore brightness and motion. Learn when the answer is uncertain." |

Notes
- This is a planned shot list, not a recorded demo. Time the actual delivery and shorten it to fit the 30-second limit. Preserve the distinction between the historical false alarm and the current refused measurement.
- Preload the prepared examples and calibration before recording. If using live catalogue results, run those checks beforehand; never edit a failed or unrun check into a passed result.
- Describe the educational benefit as intended. No independent user study, adoption count or learning gain has been established; the creator is doing a self-review.
- `?clean=1` on `/explore` hides all UI, for B-roll.
- Keyboard: Explore ← → steps one channel; Time Travel's swipe slider responds to arrow keys.
