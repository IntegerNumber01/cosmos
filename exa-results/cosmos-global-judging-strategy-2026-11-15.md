# COSMOS: global judging strategy

Prepared November 15, 2026, using the current official guides and the repository's documented implementation and scientific results. This is a strategic assessment, not a prediction of awards or a new validation of the app.

Primary sources: [2026 Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) and [2026 Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).

## Recommendation

Build the submission around **Best Use of Data**, supported by **Best Use of Science**, with **Best Use of Technology** and **Best Storytelling Award** as additional credible interpretations. Strengthen every general judging criterion. Avoid adding unrelated features to claim all ten awards.

Suggested positioning, for the team to review and adapt:

> COSMOS makes NASA's infrared sky accessible for investigation: explore a location, compare real observations across dates, measure what changed, and check whether an object is already known—with the evidence and limitations visible.

This connects public accessibility to a working scientific workflow. The project's depth lies in converting archive observations into defensible, understandable comparisons.

## 1. How selection works

The official guide describes three stages:

1. Local Event and Universal Event judging select Global Nominees.
2. Global judging evaluates nominees and selects Global Finalists; Honorable Mentions are also recognized.
3. NASA and Space Agency Partner executive judges evaluate finalists and select winners for ten awards.

Every judging level uses five criteria, each scored from 1 to 5: Impact, Creativity, Validity, Relevance, and Presentation. The public guide does not give enough information to calculate COSMOS's winning odds or an optimal mathematical allocation of effort.

The awards are final distinctions, not ten separate sets of product requirements. The published process assigns category selection to judges. The Project Submission Guide describes one project submission and does not list an award-category selection field.

There is no award called simply “Innovation” in the ten-category list. Innovation appears in Creativity and is central to Best Use of Technology.

## 2. All ten awards and their fit

The meanings below paraphrase the official guide. The priorities are our assessment.

| Award | What the distinction recognizes | COSMOS strategy |
| --- | --- | --- |
| Best Use of Data | Making space data usable or applying it in a distinctive way | **Primary.** Show the path from real SPHEREx exposures to an accessible, shareable investigation. |
| Best Use of Science | Strong application of scientific reasoning and method | **Strong secondary.** Show controls, uncertainties, independent checks, and false positives rejected. |
| Best Use of Technology | Inventive technical application | **Supporting.** Explain the technical problems solved and how they improve the user's work. |
| Best Storytelling Award | Communicating what open data makes possible through a compelling story | **Supporting.** Follow one object or investigation from question to evidence and conclusion. |
| Art & Technology Award | Effective integration of creative expression and technology | **Possible.** The visual interface and Gaia flight can support the story if their educational purpose is clear. Visual polish alone is not proof of this fit. |
| Most Inspirational | A project with strong emotional resonance | **Possible.** Invite people to investigate the changing universe and demonstrate that experience. |
| Galactic Impact | Potential for substantial benefit on Earth or beyond | **Aspirational.** Explain credible educational/citizen-science uses and a practical adoption path. Avoid unsupported claims of global reach or discoveries. |
| Global Connection Award | Technology that connects people internationally | **Currently weaker.** Coordinate sharing helps, but actual cross-location collaboration or use would strengthen the case. Public internet availability alone does not demonstrate connection. |
| Local Impact Award | Benefit to a particular community | **Currently weaker.** Would need a defined local user group and evidence of benefit, such as a tested astronomy-club/classroom activity. |
| Best Mission Concept | A credible mission proposal and design | **Poor fit for the present project.** COSMOS is an exploration/investigation tool rather than a mission proposal. |

## 3. How to strengthen all five scored criteria

### Impact

Define the users and the task: a curious person, student, educator, or citizen scientist wants to see whether a sky source moved or changed brightness without setting up astronomy software.

The most useful new evidence would be a small usability exercise with actual users:

- Ask 3–5 people unfamiliar with COSMOS to open a prepared case, identify what changed, and explain whether it is a confirmed discovery.
- Record sample size, completion, time, points of confusion, and whether people understood the result's limits.
- If claiming an improvement over an existing workflow, compare the same task under reasonably similar conditions and report the actual method and observations.
- Use findings to fix the largest obstacle. A candid small sample is better than an invented or unmeasured productivity claim.

Potential scale belongs in a future-use statement. Distinguish that from demonstrated adoption. Do not claim citizen-science contributions or discoveries that have not occurred.

### Creativity

Explain the particular improvement: a continuous path from infrared sky exploration to dated, locally wavelength-matched comparisons, measurements, catalogue checks, and an evidence record.

Blinking, FITS access, sky viewers, and image differences already exist. The submission should identify the integration and usability improvements and show the team's own contribution. No claim of being the first or only such tool is established by this research.

### Validity

The repository contains useful evidence:

- Epsilon Indi B: measured motion consistent with the predicted displacement.
- RW Aurigae: an independently measured brightness change on a clean matched pair.
- SWAN: a known comet recovered in real images with motion measurements and stated discrepancies.
- WISE 0855: a faint-source stack with motion that remains only marginally constrained.
- Barnard's Star and R Draconis: saturation limitations reported rather than hidden.
- Fresh-field analysis: controls, candidate follow-up, catalogue checks, and a spectral effect that imitated temporal variation.

Make the strongest results easy to find through a compact evidence table or linked case, including dates, wavelength, uncertainty, source files, and limits. Treat the project documents' claims as reported results unless rechecked. Avoid turning an engine regression pass into a scientific discovery claim.

The GY 152 event remains a candidate with unproven novelty. GP Mon is a known variable with measured chromatic behavior. These are interesting investigations, not established new-object discoveries. The ASR 7 rejection is useful evidence of the method's caution.

### Relevance

The challenge's central user experience is inspecting change in real SPHEREx observations over time. Put Time Travel and an observed temporal result early in the submission.

Explain which NASA resource supplies each central capability. Gaia supplies measured stellar distances for Fly; it does not supply a depth dimension to SPHEREx image pixels. Explore's all-sky mosaic is time-averaged and is not the time sequence. The current release configuration searches DR1, not all current DR1+QR3 observations.

### Presentation

Use a clear question and an observable outcome. A judge should quickly understand:

1. Who has a problem and why it matters.
2. What they can do in COSMOS.
3. A real result the tool produced.
4. Why that result is credible.
5. What could happen next and what remains limited.

The official guide explicitly asks teams to devote effort to Presentation. It also says the majority of evaluation is based on the project submission, with the demo contributing. Invest in the detailed project page as well as the deck/video.

## 4. Evidence that supports several awards at once

| Improvement | General criteria helped | Award interpretations supported |
| --- | --- | --- |
| One clear example of real dated change, with original data links | Relevance, Validity, Presentation | Data, Science, Storytelling |
| A novice can finish and understand an investigation | Impact, Validity, Presentation | Data, Technology, Inspirational |
| A false positive is rejected with an understandable explanation | Validity, Creativity, Presentation | Science, Data, Storytelling |
| A shared investigation reproduces the same selected observations | Validity, Impact | Data, Technology; Connection if people actually collaborate |
| Documented compact data transfer and usable response times | Validity, Impact | Technology, Data |

For the compact payload, the README reports about 60 kB delivered to the browser instead of a roughly 4 MB cutout. This describes the browser transfer after server processing, not elimination of the upstream FITS download. Verify the comparison on the same request before presenting a precise benchmark.

## 5. Suggested seven-slide demo

A seven-slide deck is a reasonable choice for this project's combination of visual experience and scientific evidence. This is a recommendation, not a judging preference established by the guide. The limit includes title/intro slides. Include team name, team member names, and the challenge as required.

| Slide | Message | Evidence/visual |
| --- | --- | --- |
| 1 | The infrared sky changes; inspecting that change should be accessible | Project/team/challenge; one strong before/after visual and the user problem |
| 2 | One coherent investigation workflow | Explore location → Time Travel → find change → measure → check known objects |
| 3 | It works on real NASA observations | Epsilon Indi B motion or the SWAN case, with dates and a measured-versus-predicted comparison |
| 4 | The tool helps users avoid false conclusions | Local wavelength matching, flags, native measurements; one rejected spectral false positive |
| 5 | It generalizes beyond one prepared success | Compact five-target validation table; optional fresh-field result with its actual candidate/known-source label |
| 6 | People can use it and the design is practical | Actual user-test findings if collected; usable public link; technical contribution and reproducibility |
| 7 | A credible path to broader participation | Specific next users, realistic next steps, key limits, project/repository links and concise data credits |

If choosing the 30-second video instead, show the real temporal change within its first few seconds. Use the project description and linked evidence for the technical detail that cannot fit in the video.

## 6. Order of work

1. Make one strong real-data investigation immediately understandable and reproducible.
2. Run a small real-user exercise, fix the largest obstacle, and report what happened.
3. Identify and substantiate the technical contribution relative to existing viewers.
4. Produce the demo and detailed submission around the five scored criteria.
5. Verify public access, references, SI acknowledgements, eligibility, and successful submission.

Avoid adding a mission designer, a social network, or an unrelated local feature solely to broaden award labels. Those additions would need real execution and evidence and could distract from the current strengths.

## 7. What previous winners do and do not establish

[NASA's 2025 winners announcement](https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/) describes a molecular-biology dashboard winning Science, an automated astronomical analysis system winning Data, and a weather application winning Technology. These examples show that the categories accommodate different kinds of useful software and applications. They do not publish judges' private reasons, establish that AI is required, or reveal COSMOS's odds.

The strongest strategy supported by the published material is a focused, useful project with demonstrable results, scientific care, and clear communication.
