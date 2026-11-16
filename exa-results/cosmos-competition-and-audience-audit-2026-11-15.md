# COSMOS: competition, originality, impact, and audience assessment

Prepared November 15, 2026. This is an evidence-based assessment, not a prediction of awards. No product code or submission was changed.

## Verdict

COSMOS is on the right track and substantially answers Planet X and SPHEREx. Its strongest contribution is making real, dated infrared observations available for a defensible browser investigation. Its strongest award fits are Best Use of Data and Best Use of Science. Its largest remaining weaknesses are evidence of benefit to actual users, differentiation from similar tools, and the presentation's focus.

The primary audience should be curious non-specialists who want to investigate the sky: citizen scientists, amateur astronomers, and students learning observational astronomy. Educators are an important secondary audience. Professional astronomers can use it for exploratory inspection, but the documented limitations do not support presenting it as a complete research pipeline.

## Scope and evidence

I used Exa to review 30 search results across three research angles: official competition guidance, challenge interpretation, and prior/comparable projects. Search-result counts include duplicates and are not counts of independently validated sources. I fetched relevant primary pages, rendered the official challenge and resource tabs in a browser, and reviewed the current local app and repository. This covers the central official resources and useful comparisons; it is not an exhaustive review of every online article, video, entrant, or scientific paper.

Local review included README.md; the governing brief; SUBMISSION.md; CHALLENGE_COVERAGE.md; VALIDATION.md; DISCOVERY_SEARCH.md; DEMO_SCRIPT.md; the homepage, About, Time Travel, and case-file implementations; release configuration; and saved scientific evidence. I opened the current local homepage, Epsilon Indi B Time Travel sequence, and case-file hub. Fresh screenshots are in ignored `web/.qa/judging-audit/`.

`cd web; npm test` passed all **22 existing tests** during this review. These cover engineering behavior including wavelength masks, real prepared-cutout consistency, shared state, invalid pixels, release provenance, archive failures, and the AWS fallback. They do not independently establish astronomical novelty, reproduce every science result, verify public deployment, or demonstrate usability with real participants. I did not rerun the full astrophysical pipeline or production build.

## 1. What the competition actually asks

The [official challenge](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/) asks for a public web tool that accepts sky coordinates and displays SPHEREx images over time so people can spot motion. It also names five test objects. Its additional suggestions cover release updates, wavelength displays and spectra, combining/subtracting images, field size, external overlays, coordinate URLs/embedding, quality metadata, and existing astronomy libraries. Those suggestions are explicitly optional.

Finding Planet X, discovering a new object, downloading the complete survey, and making every suggested feature are not stated conditions for answering the challenge. A carefully demonstrated small-field temporal workflow is aligned with [SME advice](https://github.com/nasa/spaceapps/discussions/2165).

| Challenge need | Current evidence | Assessment |
| --- | --- | --- |
| Public-facing web interface | Next.js browser app with examples and coordinate inputs | Implemented locally; public deployment access was not verified here |
| Coordinate-selected sky patch | RA/Dec, configurable field, SIA2 discovery | Direct match; arbitrary positions depend on live discovery |
| Real images from different dates | Dated DR1 Level-2 exposures; timeline, playback and swipe | Direct match; prepared examples are selected subsets |
| Make changes easier to see | Alignment, differences, Find changes, native measurements | Strong extension of the core objective |
| Named five-object tests | Explicit verdicts and evidence for all five | Covered, with valid limitations rather than five successful detections |
| Responsible interpretation | Local wavelength checks, flags, empirical errors, catalogue checks | Substantial scientific value; limitations remain |

The optional considerations are substantially represented in the public tool; see [CHALLENGE_COVERAGE.md](../docs/CHALLENGE_COVERAGE.md). Important qualifications are DR1-only release support, incomplete sampled spectra, display stacks rather than general motion-tracked detection stacks, and limited fields rather than a complete time-resolved sky mosaic.

The [current archive documentation](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/) lists both DR1 and QR3. COSMOS deliberately uses DR1. Refreshing DR1 does not retrieve every currently available release. This is a scope limitation to describe accurately, rather than a reason to mix releases without validation.

## 2. Did we identify and address a real problem?

Yes. The clearest problem statement is:

> People interested in the changing infrared sky need an understandable way to compare observations from different dates, while distinguishing real changes from wavelength differences, image artifacts, and already-known objects.

This ties an audience, task, and scientific obstacle together. “The universe is invisible” is an engaging introduction, but does not by itself explain the user's practical problem.

COSMOS addresses that problem through one connected sequence:

1. Choose a location or prepared example.
2. Find dated observations and choose comparable wavelengths.
3. Align the views and inspect motion or brightness changes.
4. Measure on original pixels, with flags and empirical uncertainties.
5. Check known objects and inspect provenance before interpreting a result.

The wavelength step matters because SPHEREx uses a linear variable filter: wavelength varies with image position. The [official overview](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html) explains this acquisition geometry. However, matching within half a channel is a screening rule, not proof that spectral structure cannot mimic temporal variability. COSMOS's own ASR 7 investigation demonstrates that residual risk.

Avoid claiming that public SPHEREx data previously had no browser viewer or spectra tools. [IRSA already offers a Data Explorer, spectrophotometry, mosaics, cutouts, and source-discovery tools](https://irsa.ipac.caltech.edu/Missions/spherex.html). COSMOS's proposed improvement is the integrated, approachable temporal investigation and explanation of its evidence. No comparative usability study was found, so faster/easier should be presented as a design objective until measured.

## 3. Evidence that the workflow accomplishes something

These results are documented project measurements, not independently recalculated in this review:

| Example | What the evidence supports | What it does not establish |
| --- | --- | --- |
| Epsilon Indi B | Approximately 4.7 arcseconds of motion over a year; three usable wavelength sets agree with the prediction | A new brown dwarf or a new discovery |
| RW Aurigae | Brightening of about 0.53 magnitude with empirical uncertainty about 0.06, from one clean pair | A densely sampled light curve or identified physical cause |
| WISE 0855 | Detection in prepared deblended stacks; positions consistent with predicted motion | Strong independent confirmation of motion; general public aperture photometry reproducing the offline PSF analysis |
| Barnard's Star and R Draconis | Tests identify saturation and withhold unreliable values | Successful calibrated measurement of these saturated targets |
| Comet SWAN | A known comet recovered in 20 frames, with motion evidence and documented discrepancies | A newly discovered comet or six independent motion measurements |

See [VALIDATION.md](../docs/VALIDATION.md) and [MILESTONE1_REPORT.md](../docs/MILESTONE1_REPORT.md). [Challenge clarification on saturation](https://github.com/nasa/spaceapps/discussions/2282) supports reporting affected targets as unmeasurable. The saturated-star recovery techniques remain future or supplementary work.

The blind search gives the submission additional substance: **59 initial native images, 774 usable source-pair comparisons, and 13 candidate clusters, all inspected**. [DISCOVERY_SEARCH.md](../docs/DISCOVERY_SEARCH.md) records:

- GY 152: candidate infrared dimming, with independent dim exposures, reference-star controls, and subsequent return toward the baseline. The source is known; event novelty and cause remain unproven.
- GP Mon: strong short-wavelength brightening of a known unresolved system, with a much smaller long-wavelength change.
- ASR 7: a spectral feature that initially mimicked temporal change. Follow-up stopped the team from presenting it as a confirmed brightness event and improved the app's warnings.

This is a compelling science story: real observations produce a lead; controls and follow-up strengthen or reject an interpretation; users can inspect the evidence. A new-object claim is unnecessary.

## 4. Originality: meaningful execution, shared underlying concept

The project is creative in how it brings exploration, temporal inspection, measurement, catalogue context, and case-based learning together. It cannot credibly claim to have invented sky blinking or to be the only SPHEREx temporal viewer.

The [official Resources tab](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources) explicitly recommends WiseView as a model. The [WiseView authors](https://github.com/backyardworlds/wiseview) describe use by citizen scientists and professional astronomers to inspect motion and variability.

There is also direct same-challenge overlap:

| Comparison | Publicly described overlap | Implication |
| --- | --- | --- |
| [Team OSU: Watch the Sky Change](https://github.com/osu-spherex/planet-x-spherex) | Coordinates, dated SPHEREx images, alignment, differences, wavelength matching, measurements, caches, motion search and stacking | Coordinate-to-blink and scientific measurements alone are not exclusive differentiators |
| [Muninn](https://github.com/root3315/muninn) | DR1/QR3 browsing, cloud byte-range image access, flags, Gaia/WISE context, spectra and catalogue context | AWS access and multi-archive overlays are also shared approaches |

These comparisons rely on the authors' public descriptions, not independent validation of their results. Similarity is expected when teams answer the same prompt; it is not evidence of copying. I did not rank the implementations or audit competitor science.

Defensible differentiators to demonstrate are:

- A connected journey from infrared exploration to an evidence-backed investigation, with technical detail available progressively.
- Local wavelength checks at the location of changes and measurements, together with an explicit demonstration of their remaining limits.
- Clear separation of measured quantities, predictions, candidate associations, and unavailable measurements.
- Reproducible case files that show both successful recoveries and rejected interpretations.
- Prepared real observations that remain useful during archive failures, with the limited cache scope visible.

None of these should be described as globally unique without a wider feature-by-feature study. “An original, carefully executed combination” is supportable; “the first and only” is not.

## 5. Target audience and current fit

The challenge's intended audience is broad public participation. For a useful product strategy, narrow that into people with an immediate task.

| Audience | Job they want to do | Current appeal and friction |
| --- | --- | --- |
| Primary: interested beginners, students, amateur astronomers, citizen scientists | See a real sky change and understand whether it deserves investigation | Prepared targets, plain explanations, swipe, numbered steps and evidence links help. Small motion, pixelated images, wavelength choices and subtle uncertainty remain demanding |
| Secondary: educators and astronomy clubs | Guide a short activity using authentic observations | Case files, shareable links, explanations and reproducible examples help. No classroom pilot or learning-outcome evidence was found |
| Supporting: professional astronomers | Quickly inspect a field or candidate | Native measurements, provenance and downloads help. Limited release support, aperture/PSF limitations, crowding, parallax and archive dependence constrain research use |
| Casual visitor | Enjoy and understand the infrared sky | Explore, Fly and the homepage offer an attractive entry. That visitor may never reach the temporal investigation central to the challenge |

The current app is more approachable than its technical documentation: coordinate settings and scientific details are collapsible, targets are selectable, and the case hub explains verdicts in everyday language. Existing mobile screenshots and responsive layouts show deliberate attention to smaller screens. These are design observations, not proof of audience appeal or a completed accessibility audit.

The most important homepage issue is emphasis. Its first message introduces invisible light and its primary button leads to Explore. The challenge's central benefit, seeing change over time, is the secondary action. For judging and for novice investigators, make a guided real-change example the clearest starting point. Explore and Fly can invite users deeper into that same journey.

Epsilon Indi B's annual motion is smaller than one SPHEREx pixel. A novice should be shown a magnified comparison and a plain interpretation of the measurement, rather than expected to notice the shift unaided. A clearer brightness example such as RW Aur can complement it.

Recommended audience statement:

> COSMOS helps curious students and citizen scientists investigate the changing infrared sky using real NASA observations, without installing astronomy software.

## 6. Impact and judging assessment

The [judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) uses Impact, Creativity, Validity, Relevance, and Presentation. The following are qualitative assessments, not official scores or winning probabilities.

| Criterion | Current assessment | Main opportunity |
| --- | --- | --- |
| Relevance | Strong: real NASA observations are indispensable to the coordinate-to-time-sequence workflow | Put that workflow at the front of the submission |
| Validity | Strong scientific discipline and engineering evidence, with documented limits | Keep offline analyses distinct from general viewer capabilities; verify deployed examples |
| Creativity | Meaningful integration and execution; substantial overlap with existing and same-event tools | Demonstrate the specific user and scientific benefits of the combination |
| Impact | Plausible benefit, limited evidence of realized reach or effectiveness | Measure whether intended users can complete a useful task |
| Presentation | Visually engaging product and rich evidence; final demo not assessed | Tell one clear user story and finish within the strict format limit |

High impact is currently a potential, not an established outcome. No adoption figures, documented educator deployment, measured time savings, or novice task study were found in the reviewed material. A billion objects in the source archive does not establish a billion people served by the app.

A small, honest formative study would provide more useful evidence than another feature. Recruit three to five intended users if available. Ask them, without a guided tour, to open a prepared case, compare two dates, explain whether the object moved or brightened, identify a limitation, and share the evidence. Record completion time, successful interpretation, help required, and confusion about predictions versus measurements. Report the small sample honestly and avoid generalizing it to population-level adoption. If testing students under 18, do not put their likenesses or voices in submission materials; the submission guide prohibits those.

## 7. Award strategy and presentation priorities

Best Use of Data is the strongest match because access to usable NASA observations is central. Best Use of Science is equally credible when emphasizing controls, failed hypotheses, reproducibility, and limited claims. Best Use of Technology is plausible but needs comparison evidence; storytelling and art/technology depend on the finished delivery. Galactic Impact, Global Connection and Local Impact need stronger supporting evidence than a public URL or broad aspirations.

The [2025 NASA winner summaries](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/) are useful examples of projects framed around a beneficiary and a concrete task. This is an inference from public summaries, not access to judges' private reasoning or a recipe guaranteeing selection.

Prioritize:

1. State one audience and the problem they face.
2. Demonstrate one complete real-data investigation, then provide the other cases as evidence.
3. Make the blind-search learning visible: a promising lead, a known variable, and a rejected spectral false positive.
4. Say exactly what differs from prior tools, without exclusivity claims.
5. Obtain a small amount of actual user feedback if feasible.
6. Finish public access, demo, references and submission fields before optional expansion.

Recommended project framing:

> COSMOS turns NASA's infrared observations into investigations that curious people can follow: compare dates, measure a change, check known objects, and see how strong the evidence really is.

The current [DEMO_SCRIPT.md](../docs/DEMO_SCRIPT.md) contains approximately **94 spoken words**, about **38 seconds at 150 words per minute**, before allowing for transitions. The existing title does not establish a compliant 30-second recording. Also replace “six dates a year apart” with “six dates across one year.” A short demo should give viewers time to see one result.

Suggested approximately 50-word narration, with team name and challenge on screen:

> NASA's infrared sky is public. Investigating its changes takes specialist tools. COSMOS helps students and citizen scientists compare real observations in a browser. Watch this brown dwarf move. Measure the change. Check what's already known. Every result includes its evidence and limits. Real NASA data, opened to curious people.

Time the actual recording. Alternatively, use the allowed seven-slide deck: audience/problem; one user journey; a real result; how comparisons remain scientifically defensible; blind-search findings; value and differentiation; limitations and next steps. Include team/member names and the challenge, counting title slides within the limit.

## 8. Resource map and final requirements

The central resource set is the [official resource directory](https://www.spaceappschallenge.org/resources/). It contains participant FAQs, Connect, submission, judging and team-formation guides. Rules and SME clarification carry more weight than generic advice on winning hackathons.

| Resource | Why it matters for COSMOS |
| --- | --- |
| [Judging & Awards](https://www.spaceappschallenge.org/resources/judging-awards-guide/) | Five criteria, award definitions and judging stages |
| [Project Submission](https://www.spaceappschallenge.org/resources/project-submission-guide/) | Required form, demo limits, public links, references and SI disclosure |
| [Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/) | Event participation, timing and work-start rules |
| [Team Formation](https://www.spaceappschallenge.org/resources/team-formation-guide/) | Event membership and team eligibility |
| [Space Apps Connect guide](https://www.spaceappschallenge.org/resources/space-app-connect-guide/) and [discussion forum](https://github.com/nasa/spaceapps/discussions) | Where authoritative clarifications and participant questions appear; direct guide extraction failed in this pass |
| [Challenge details and resource tab](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources) | Required objectives, optional suggestions and supplied data resources |
| [IRSA SPHEREx hub](https://irsa.ipac.caltech.edu/Missions/spherex.html), [tutorial notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/), [data access](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/) | Authoritative products, calibration/access context, existing tools and acknowledgment instructions |
| [WiseView source](https://github.com/backyardworlds/wiseview) | Recommended precedent; establishes that blinking is an existing approach |
| [Gaia mission data](https://archive.stsci.edu/missions-and-data/gaia) | Partner data supporting positions, distances and motion context |
| [CSA NEOSSat overview](https://www.asc-csa.gc.ca/eng/satellites/neossat/), [tutorial](https://github.com/asc-csa/NEOSSAT_Tutorial), [dataset](https://data.asc-csa.gc.ca/dataset/neossat), [CADC](https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/) | Supplied partner resources for possible additional context; using every resource is unnecessary |
| [2025 winners](https://www.spaceappschallenge.org/2025/awards/global-winners/) and [NASA summaries](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/) | Presentation examples and beneficiary framing, rather than hidden scoring rules |

The [submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) requires a separate public demo of at most 30 seconds or seven slides, plus a final-project link. Most evaluation is based on the submission page, so it must explain the project without requiring judges to read the repository. Complete the actual SI-use disclosure and external-resource references accurately. The research and proposed wording here should be reviewed by the team and described honestly where required; do not invent a human-origin story for assisted work.

Confirm public access without login, team membership in the appropriate event, required form completion, and successful submission. Local Event teams may have 1–6 members; Universal Event teams need 2–6 for global eligibility. The deadline is November 15 at 11:59 p.m. in the Local Event's timezone, or the Team Owner's residential timezone for Universal Event teams. The device's Pacific timezone alone does not establish the applicable deadline. These account/submission facts were not verified in this review.

The [FAQ](https://www.spaceappschallenge.org/resources/participant-faqs/) also says teams cannot begin challenge work before the hackathon. The repository brief and documented work are dated November 14–15; this review did not audit every work timestamp or determine eligibility. Preserve a truthful record of when the team's work occurred.

The most valuable remaining work is to make the existing evidence easy for the intended audience and judges to understand, demonstrate a complete user outcome, and accurately finish the submission.
