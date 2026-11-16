# COSMOS: impact evidence and intended benefit

## Beneficiary and useful outcome

The initial audience is students and astronomy-club beginners, with teachers and club facilitators able to use the same investigation kit. Experienced amateur astronomers can bypass the lessons and inspect the full tools.

The practical problem is moving from an apparent difference in archive images to an interpretation a non-specialist can explain and another person can check. The intended outcome is that a learner can compare dated observations, distinguish measured motion from a catalogue prediction, explain a brightness result with uncertainty, reject an unreliable measurement, and preserve evidence with outstanding questions intact.

## What exists now

- `/learn/kit`: a printable 15–20 minute plan, prerequisites, facilitator key, self-review prompts and advanced extensions.
- `/learn/lab`: three actual SPHEREx DR1 image pairs, calculated with the app's native-pixel reference-star calibration. Learners record an initial judgement and reason before an explanation, then propose a follow-up check. Their answers can be downloaded without an account or submission to a server.
- `/learn/lab#reasoning-check`: a different real-image pair on GP Mon, with four closed questions and a written evidence handoff before the key is revealed. Initial answers are locked and retained. Readable text and JSON include the response, exact result, dates, original observations, comparison link and four facilitator review prompts. Only closed-choice agreement is scored; written reasoning requires human review. This is a formative activity, not a validated assessment or a measurement of learning gains.
- The homepage's real-image blink and the guided starting point both lead with Epsilon Indi B's motion. The displayed 4.79 ± 0.59″ is recalculated from saved native pixels and reference stars; the stored preflight answer is not used as a fresh result. Playback starts only when requested. Motion and Summary are separated so the reference-corrected fit is not mixed with the rougher uncorrected summary.
- RW Aur demonstrates a supported brightness change; Epsilon Indi B demonstrates no significant brightness change at this precision; the blended field-star control demonstrates refusal rather than a spurious calibrated value. Epsilon Indi B's motion is a separate investigation.
- Time Travel exports a readable evidence handoff as well as JSON and CSV. Comparison links preserve the selected measurement, including proper-motion information and observation-time context when present. Files retain notes and the check statuses from the time of export; URLs do not carry notes.
- Prepared activities load their real images and reference fields from this site. They are independent of live archive/catalogue services after those files load. General sky searches and original FITS retrieval still need their providers. This is not a claim that the complete site works offline.

## What is not established

There is no independent participant study, measured educational gain, documented classroom or club adoption, comparative time saving, confirmed novel discovery, or established scientific review partnership. Automated regression results establish engineering behaviour, not audience benefit.

No scored independent participant results are recorded. `SELF_REVIEW.md` provides a creator walkthrough worksheet; `USER_TEST.md` provides a protocol for a future independent study.

## Earlier engineering verification on 15 November 2026

All 41 Node regression tests passed, along with typecheck, lint and the production build. The guided browser suite passed for brightness, motion, exports, sharing, advanced controls, mobile layouts and runtime errors. The learning browser suite passed with live API services deliberately unavailable: all three cases, a deliberately incorrect initial answer retained after reveal, response download, the blended source's refused calibration, readable/JSON report notes and open checks, restoring that selected source in a fresh tab, print-to-PDF, mobile layouts and no runtime errors. Artifacts are in ignored `web/.qa/learning/` and `web/.qa/guided/`.

These checks were automated. They are not a completed creator session or an independent user study. Reproduce them with `pipeline/tools/learning_ui.py` and `pipeline/tools/guided_ui.py` against a running app.

The subsequent interface/motion change passed 48 Node regression tests, TypeScript, lint and a production build. Browser checks verified the compact guide, Summary/Motion/Evidence views, real reference-star motion, specified-trajectory stacking, contributor/quality limits, readable/JSON exports and retained notes. Epsilon Indi B gives 4.79 ± 0.59″ displacement; RW Aur and an additional GP Mon field remain consistent with no significant positional change. These establish scoped engineering/scientific behavior, not independent audience benefit. See `MOTION.md` and `pipeline/tools/motion_ui.py`. A separate seven-slide demo is under `docs/demo/`; personal details are intentionally omitted.

## Earlier implementation and verification

The latest implementation passes **66 Node regression tests**, lint, TypeScript and the production build. `pipeline/tools/investigation_ui.py` passes against the compiled app with live APIs blocked: real homepage motion calculation and blink, motion-first navigation, the new GP Mon activity, retained incorrect initial choices, readable/JSON exports with original observations, all benchmark fields and worsened cases, explicit failure/retry, mobile layout and no runtime errors. The learning, guided and motion browser suites also pass against the compiled app. `pipeline/tools/inventory_ui.py` additionally verifies a partial-inventory search outside the prepared cutouts, six real new-coordinate cutouts, provenance and retained data after an explicit refresh failure. The seven-slide demo was rebuilt from current app captures and checked for content overflow. These are automated engineering checks, separate from informal creator feedback or a participant study.

The current source also includes the GP Mon transfer exercise and a deterministic retrospective motion benchmark. Of 229 additional stars selected across eight fields, 48 pass the unchanged motion rules; 181 are refused. The identical accepted sample has median vector residual 0.561″ without reference correction and 0.441″ with it; 28 improve and 20 worsen. These are correlated measurements, not independent trials or a survey-wide success rate. The protocol, cases, failures and checksums are published at `/validation#motion-benchmark`. This scientific method comparison does not measure educational impact.

## Latest science and data verification

The subsequent science/data audit passes **68 Node regression tests**, lint, TypeScript and the production build. At `/validation#reproduce`, it checks every consumed image and reference-field SHA-256 hash and repeats five calculations: motion, supported brightenings, insignificant brightness change and a refused blend. The downloadable record retains original FITS links, dates, wavelengths, hashes and current results. `pipeline/tools/evidence_audit_ui.py URL` verifies the compiled browser flow with live APIs blocked, the JSON handoff, explicit refusal after a changed image byte, recovery on retry, mobile layout and absence of runtime errors. This checks local consistency against unsigned site manifests and repeats the production method; it is not independent scientific replication, archive authentication or evidence of educational impact.

## How to collect stronger evidence later

| Claim to investigate | Observable evidence | Limits |
| --- | --- | --- |
| A beginner can interpret a result | Task completion plus an explanation of a measurement and its uncertainty | Record help and prior experience; clicks alone do not show understanding |
| The activity helps scientific reasoning | A reasoned answer on a different case, including an appropriate inconclusive answer | A small formative exercise does not validate general learning gains |
| The evidence can be checked | Another person reconstructs the same selected measurement and identifies an unresolved check | Creator re-opening tests reproducibility only, not independent usability |
| The kit fits a group | An actual facilitator runs or reviews it and describes preparation and confusion | An invitation or positive comment is not adoption |
| The workflow reduces effort | Comparable, timed tasks with the existing archive workflow and consistent help | Control for familiarity and task order before claiming superiority |

## Submission wording

“COSMOS is designed to help students and citizen scientists investigate how the infrared sky changes using real SPHEREx observations. A short investigation kit, three contrasting real-data cases and an evidence worksheet support interpreting uncertainty and recognizing false alarms. Readable reports preserve the observations, failed checks and open questions for review. These capabilities demonstrate a route to educational benefit; independent learning and adoption outcomes have not yet been measured.”

This is a potential-impact statement. It does not require or imply a public deployment, user counts or a completed study.
