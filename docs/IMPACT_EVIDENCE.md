# COSMOS: impact evidence and intended benefit

## Beneficiary and useful outcome

The initial audience is students and astronomy-club beginners, with teachers and club facilitators able to use the same investigation kit. Experienced amateur astronomers can bypass the lessons and inspect the full tools.

The practical problem is moving from an apparent difference in archive images to an interpretation a non-specialist can explain and another person can check. The intended outcome is that a learner can compare dated observations, explain a brightness result with uncertainty, reject an unreliable measurement, and preserve evidence with outstanding questions intact.

## What exists now

- `/learn/kit`: a printable 15–20 minute plan, prerequisites, facilitator key, self-review prompts and advanced extensions.
- `/learn/lab`: three actual SPHEREx DR1 image pairs, calculated with the app's native-pixel reference-star calibration. Learners record an initial judgement and reason before an explanation, then propose a follow-up check. Their answers can be downloaded without an account or submission to a server.
- RW Aur demonstrates a supported brightness change; Epsilon Indi B demonstrates no significant brightness change at this precision; the blended field-star control demonstrates refusal rather than a spurious calibrated value. Epsilon Indi B's motion is a separate investigation.
- Time Travel exports a readable evidence handoff as well as JSON and CSV. Comparison links preserve the selected measurement, including proper-motion information and observation-time context when present. Files retain notes and the check statuses from the time of export; URLs do not carry notes.
- Prepared activities load their real images and reference fields from this site. They are independent of live archive/catalogue services after those files load. General sky searches and original FITS retrieval still need their providers. This is not a claim that the complete site works offline.

## What is not established

There is no independent participant study, measured educational gain, documented classroom or club adoption, comparative time saving, confirmed novel discovery, or established scientific review partnership. Automated regression results establish engineering behaviour, not audience benefit.

The creator plans to experiment personally. `SELF_REVIEW.md` records that process without presenting the creator as an independent participant. `USER_TEST.md` remains available for an optional later study. No one was contacted and no feedback was fabricated.

## Engineering verification on 15 November 2026

All 41 Node regression tests passed, along with typecheck, lint and the production build. The guided browser suite passed for brightness, motion, exports, sharing, advanced controls, mobile layouts and runtime errors. The learning browser suite passed with live API services deliberately unavailable: all three cases, a deliberately incorrect initial answer retained after reveal, response download, the blended source's refused calibration, readable/JSON report notes and open checks, restoring that selected source in a fresh tab, print-to-PDF, mobile layouts and no runtime errors. Artifacts are in ignored `web/.qa/learning/` and `web/.qa/guided/`.

These checks were automated. They are not a completed creator session or an independent user study. Reproduce them with `pipeline/tools/learning_ui.py` and `pipeline/tools/guided_ui.py` against a running app.

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
