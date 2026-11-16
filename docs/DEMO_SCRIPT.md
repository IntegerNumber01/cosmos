# 30-second demo: from a moving dot to a defensible explanation

A separate seven-slide alternative is available in [demo/COSMOS-demo.pdf](demo/COSMOS-demo.pdf) and its editable, standalone [HTML source](demo/COSMOS-demo.html). It uses real screenshots, leads with measured motion, then follows brightness, a refused false alarm, a new learner investigation and evidence handoff. It identifies team Sol27; personal details stay outside the app. Complete any required submission identification separately. Rebuild from captured screenshots with `pipeline/.venv/Scripts/python pipeline/build_submission_demo.py`, or pass a running local URL (for example `http://localhost:3755`) to capture fresh app images first. The generator checks seven slides and text/visual overflow.

Record the real app (`npm run build && npm start`), 1920×1080, on a machine with a real GPU. Open each page once beforehand so the tiles and data are cached. Featured targets also load from the prepared cache.

| Time | Screen | Action | Voice-over / caption |
|---|---|---|---|
| 0–4 s | Homepage real-image blink | Switch between the two dated observations. | "COSMOS, by Sol27. Learn to tell real sky changes from false alarms." |
| 4–10 s | `/timetravel?target=epsindib&guide=1&mode=swipe` | Show the 4.79 ± 0.59″ motion and separate catalogue prediction. | "This brown dwarf moves four point eight arcseconds, measured against reference stars." |
| 10–15 s | RW Aur measurement | Show the calibrated headline, dates and wavelength. | "RW Aur brightens by sixty-one percent, plus or minus six." |
| 15–20 s | `/learn/lab`, case 3 | Show the current blended-source refusal. | "Overlapping starlight fools this comparison. Our checks refuse it." |
| 20–25 s | `/learn/lab#reasoning-check` | Show GP Mon and the learner's initial explanation before the key. | "Try a new case. Explain the result, uncertainty, and next observation." |
| 25–30 s | Downloaded reasoning and evidence | Show the original-data links and unanswered checks. | "Download the reasoning and original NASA evidence for someone else to check." |

Notes
- About 68 spoken words. This is a planned shot list, not a recorded demo. Time the actual delivery, including pauses, and shorten it to fit the 30-second limit. Preserve the distinction between the historical false alarm and the current refused measurement. The seven-slide deck is an independently usable alternative.
- Preload the prepared examples and calibration before recording. If using live catalogue results, run those checks beforehand; never edit a failed or unrun check into a passed result.
- Describe the educational benefit as intended. No independent user study, adoption count or learning gain has been established; the creator is doing a self-review.
- `?clean=1` on `/explore` hides all UI, for B-roll.
- Keyboard: Explore ← → steps one channel; Time Travel's swipe slider responds to arrow keys.
