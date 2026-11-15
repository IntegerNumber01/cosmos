# Space Apps discussions: findings for COSMOS

Researched November 15, 2026. Project: COSMOS, Planet X and SPHEREx.

## Scope and confidence

Exa searches returned 56 result slots across three research angles: SPHEREx science/data access, hosting/global offers, and submission/judging. Results overlap; this is not a count of 56 unique sources. Relevant discussions and official guides were read in full where accessible. This is a targeted extraction, not an exhaustive archive of every forum post. The linked challenge page itself returned only its heading through one reader and a gateway error through another; technical interpretation was checked against SME replies, IRSA documentation, and the local project documentation. The email itself was not retrieved.

Authority matters: GO Team announcements establish event requirements; SME replies clarify science; Navigator and participant answers offer useful guidance but are not automatically official policy. A green “Answered” marker alone does not establish authority. Some answers were updated after an earlier workaround stopped working.

The local comparison below is based on reading the current repository, including README.md, docs/CHALLENGE_COVERAGE.md, web/next.config.ts, the API routes, and the release configuration. No deployment or new scientific validation was performed for this research.

## 1. Vercel and domains

**Vercel is a suitable hosting choice for COSMOS. A purchased/custom domain is not required.**

- The GO Team announced a GoDaddy offer for a free domain and one year of website hosting. The announcement explicitly describes Global Offers as optional: [offer announcement #2058](https://github.com/nasa/spaceapps/discussions/2058).
- In a domain-offer support thread, Ashlynn-GO-Team explicitly confirms that offers are not necessary to complete or submit a project: [#2116](https://github.com/nasa/spaceapps/discussions/2116). This is the strongest direct answer to the domain question.
- Vercel automatically supplies a project domain ending in `.vercel.app`: [Vercel domains documentation](https://vercel.com/docs/domains/working-with-domains). Use the production project domain in the submission.
- A domain is the address; hosting runs/serves the application. A custom domain registered elsewhere can point to Vercel. Claiming a domain does not require moving the application to the registrar's host.
- The many domain threads are primarily about redeeming the optional offer and receiving verification codes. They are not evidence of a competition requirement to purchase hosting.

### What matters for this repository

COSMOS is a Next.js app with Node.js API routes. `web/` is the Vercel project root, as documented in README.md. The observations, cutout, and known-object routes explicitly use the Node.js runtime and declare `maxDuration = 60`.

Those server routes discover archive images, fetch/parse FITS cutouts, and query catalogues. A static-only host would require architectural changes to preserve those capabilities. Vercel supports the current architecture. The Python scripts are preprocessing/research tools; the public app's request handlers use TypeScript.

Practical deployment checks:

1. Set Vercel's project root to `web/` and retain the Next.js framework configuration.
2. Open the production URL in a private browser, with no Vercel account signed in.
3. Check that the production URL and its API requests do not require authentication. Preview URLs can be protected even when the production domain is public: [Deployment Protection](https://vercel.com/docs/deployment-protection).
4. Exercise a prepared target and a live coordinate query separately. Cached-target success does not establish that IRSA is available.
5. Keep the prepared real-data examples. Hosting the app on Vercel cannot repair an upstream IRSA outage.
6. Keep expensive bulk processing outside interactive requests. Hosting has runtime, memory, bundle, and usage limits: [Vercel Functions limits](https://vercel.com/docs/functions/limitations). The route's 60-second setting is this project's setting, not a claim that every Vercel plan has a universal 60-second maximum.

The submission guide recommends, but does not require, requesting a FortiGuard Web Filter Classification for a new project website to reduce access problems on judges' networks. This is separate from owning a custom domain: [official submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).

## 2. Findings specific to Planet X and SPHEREx

| Finding | Evidence and authority | Implication for COSMOS |
| --- | --- | --- |
| Showing real changes over time is central. A single sky image cannot demonstrate temporal change. | Prateek-SME recommends small cutouts from several dates; dancaselden explicitly describes multi-epoch visualization as required in [#2165](https://github.com/nasa/spaceapps/discussions/2165). | Put Time Travel and an understandable real temporal result near the start of the pitch. Explore and Fly support that story. |
| Teams do not need to download or host the complete survey. | SME guidance in [#2165](https://github.com/nasa/spaceapps/discussions/2165) favors small real regions and a few observation dates. | Our coordinate search, cutouts, and prepared examples are aligned with this approach. There is no requirement to run a huge archive ourselves. |
| The named test targets remain relevant. | [#2165](https://github.com/nasa/spaceapps/discussions/2165) reiterates Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, and R Draconis. | Include the five validation records, with their actual verdicts. The SWAN case is an additional demonstration. |
| Saturation is a legitimate limitation to report. | In [#2282](https://github.com/nasa/spaceapps/discussions/2282), silverbergastro confirms that reporting saturated targets as unmeasurable is reasonable, with thoughts on future handling. The reply emphasizes positional changes as well as brightness. | Keep the honest Barnard's Star/R Draconis limitations. Do not manufacture flux values or assume every test target must yield a successful brightness measurement. |
| Wavelength matching matters. | Navigator/participant discussion [#1847](https://github.com/nasa/spaceapps/discussions/1847), supported by [IRSA's SPHEREx overview](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html): linear variable filters associate wavelength with detector position. | Same detector alone does not establish equivalent wavelengths. Preserve our local wavelength checks, WCS alignment, and quality masks. |
| Changes in apparent position and brightness require different interpretation. | [#1847](https://github.com/nasa/spaceapps/discussions/1847) recommends measuring both and accounting for proper motion, wavelength, calibration, timing, and image quality. | A moving source is not automatically an asteroid or Planet X. An unmatched source is a candidate requiring follow-up. Our catalogue checks and cautious labels are useful here. |
| Existing astronomy viewers do not remove the challenge's purpose. | Participant explanation [#2217](https://github.com/nasa/spaceapps/discussions/2217) interprets the opportunity as accessible temporal/multiband exploration. This is an interpretation, not a new rule. | Explain the user benefit: coordinates to aligned dated images, observable changes, measurements, and known-object checks in one public workflow. |

### Saturation: distinguish an SME statement from informal encouragement

The accepted Navigator answer in #2282 calls PSF-wing photometry optional “extra credit.” That phrase is informal advice, not a published scoring category. The subsequent SME reply is what substantiates reporting saturated targets as unmeasurable. Advanced recovery methods should remain experimental unless independently validated.

### Synthetic data

In #2165, GO Team guidance permits NASA resources and other freely available/open resources, with attribution and permission where applicable. Technical replies prefer real small-field data. dancaselden offers a personal view that explicitly identified synthetic additions could be useful for demonstrations, while inviting others to weigh in.

This does not establish a blanket guarantee that an entirely simulated temporal demonstration fulfills the challenge. COSMOS already has real multi-epoch examples; keep those as the evidence. Synthetic regression tests are distinct from observational results.

## 3. Archive outages and releases

### What the discussions actually establish

- [#2183](https://github.com/nasa/spaceapps/discussions/2183) starts with TAP access problems on November 14. A later update says SIA worked initially but was also returning 502 errors on November 15.
- [#2237](https://github.com/nasa/spaceapps/discussions/2237), [#2245](https://github.com/nasa/spaceapps/discussions/2245), and [#2257](https://github.com/nasa/spaceapps/discussions/2257) report related failures. These establish reported outages at those times, not a live status guarantee now.
- Advice to document the failure and demonstrate downloaded/cached data is useful. There is no confirmed special extension or guaranteed judging accommodation in the reviewed replies. The official deadline remains the governing requirement.
- A failing TAP query does not prove that every image file, HiPS service, or cloud object is inaccessible. Conversely, a workaround that worked yesterday may fail today.

### Use the current official data-access guide for fallback design

[IRSA's data-access documentation, dated November 12, 2026](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/), confirms:

- SPHEREx files are available on premises at IPAC and mirrored on AWS.
- SIA2 discovery returns `access_url` for on-premises files and `cloud_access` information for cloud files.
- Current wide-survey collections are `spherex_dr1` and `spherex_qr3`; matching `_deep` collections cover the deep survey.
- DR1 plus QR3 supersede QR2. QR2 is no longer searchable through SIA2, although direct downloads remain available through February 2027.
- Small on-premises FITS cutouts can be requested by adding center and size parameters to the image URL.
- New data are ingested weekly; SIA2 can lag other interfaces by roughly a day.

Two forum shortcuts need care:

1. **QR2 AWS examples are not the current baseline.** Some outage replies link QR2 because files remained accessible. Prefer the current official release documentation rather than copying an older example into a DR1 pipeline.
2. **HiPS is useful for exploration but does not replace dated temporal images.** COSMOS's SPHEREx all-sky mosaic has no time axis. An outage reply suggesting HiPS as a general viewer fallback should not be read as permission to turn that mosaic into an observed time sequence.

### Concrete scope limit in our repository

`web/src/lib/engine/releases.ts` fixes the public tool's release to DR1 and collection to `spherex_dr1`. `docs/CHALLENGE_COVERAGE.md` already explains the reproducibility choice and says QR3 integration needs explicit validation.

Therefore, describe COSMOS as using **SPHEREx DR1**, not searching every current release. Its refresh feature checks DR1 again; it does not discover QR3 observations. QR3 is a possible future extension, not a reason to silently mix releases before submission.

## 4. Submission details that are easy to miss

The [official Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [GO Team checklist #2260](https://github.com/nasa/spaceapps/discussions/2260), and [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) establish the following.

### Two separate deliverables and links

| Field | What to provide for COSMOS |
| --- | --- |
| Link to Project Demo | Public video of at most 30 seconds, or public slide deck of at most 7 slides total, counting title/intro slides. A seven-slide PDF is suitable as a deck. |
| Link to Final Project | Public production COSMOS URL; include the public source repository among project links as well. |

A live app alone does not replace the required video/deck. [#2281](https://github.com/nasa/spaceapps/discussions/2281) explains this exact distinction for a static astronomy project; its Navigator response agrees with the official guide. The brief demo and the detailed project page both contribute to judging.

The platform accepts JPG/PNG/GIF images up to 10 MB but not video/document uploads. Host the demo externally and paste the public link. Test every link without being logged in.

### Form content and references

- Provide project name, concise high-level summary, demo link, final-project link, detailed description, SI usage information, NASA resources, and other references; complete the confirmation boxes.
- Explain what the app does, how it works, its benefits, intended impact, and tools used. Separate demonstrated behavior from planned features.
- The official guide does not publish a character limit for the summary or detailed description. [#2280](https://github.com/nasa/spaceapps/discussions/2280) advises watching for any limit exposed by the form. Do not treat “no published limit” as proof the implementation has none.
- For Global Award eligibility, use at least one NASA resource. GO Team guidance in [#1827](https://github.com/nasa/spaceapps/discussions/1827) specifically directs teams to NASA data in their challenge's Resources tab. Real SPHEREx data should be prominent in our submission.
- List every data source, library/tool, code source, text, and image used, including freely available/open-source materials. Obtain permission where copyrighted materials require it.
- Full references belong in the submission's NASA Data and other References fields. Concise asset credits can accompany individual visuals; a full bibliography need not consume the short demo: [citation-placement discussion #2268](https://github.com/nasa/spaceapps/discussions/2268).
- For COSMOS, account for SPHEREx/IRSA, the all-sky cube, Gaia/ESA/DPAC, SIMBAD/CDS, JPL small-body services, Aladin Lite, the software stack, and any other actual resources/assets used. Give release identifiers/DOIs where available.

### AI/SI disclosure

The official submission guide permits SI tools for assistance and acceleration but reserves the solution idea to the team. It requires identification of where/how SI was used:

- Generated images/videos: visible watermark indicating SI generation.
- Generated audio: acknowledgement in descriptive text and metadata.
- Generated code/data: acknowledgement in descriptive text and metadata.
- Generated content must not use, contain, or modify NASA branding/design elements such as NASA logos, flags, or mission identifiers.
- Complete the SI form field. The guide says the form response itself is for data collection and is not shown to judges; visible acknowledgements in the final project still matter.

For COSMOS, describe the actual coding assistance and human verification accurately. Do not imply SI-generated observations if the displayed observations are real archive data. The public disclosure can say which parts were assisted and what checks the team performed.

### Eligibility, language, deadline, and publishing

- Local Event teams: 1–6 participants. Universal Event teams: 2–6 for Global Judging eligibility.
- Every teammate must appear on the team and be confirmed in the same event; being waitlisted is insufficient.
- Submission text and linked materials must be in English. Videos may use another spoken language with English subtitles; slide decks must be in English.
- Demo/final-project materials may not include images, video, audio, or other likenesses of people under 18, per the published guide.
- Global submission closes **Sunday, November 15, 2026, at 11:59 p.m. in the Local Event's timezone**, or the Team Owner's residential timezone for the Universal Event. If Pacific is the applicable timezone, this is 11:59 p.m. PST. The user's device timezone alone does not establish their Local Event's timezone.
- Local judging/pitch deadlines may differ; check the Local Lead's schedule.
- “Save Progress” is not submission. Click **Submit for Judging**, finish required confirmations, and check the success banner. Edits/resubmissions are permitted before closure; the final submission is what judges review.
- The guide says late saves/submissions are ineligible. Do not rely on an outage extension or post-deadline editing.
- A submitted project's participant certificate becomes available in each participant's profile.
- Site/submission technical problems: `web@spaceappschallenge.org`, with browser, relevant page link, and error details. An IRSA data-access problem belongs with the IRSA support channel; the Space Apps site team does not operate the archive.

## 5. Judging implications and recommended priorities

The official rubric scores each of **Impact, Creativity, Validity, Relevance, and Presentation** from 1 to 5. A custom domain is not a listed criterion: [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/).

Recommended work order for this project:

1. Publish a publicly accessible production deployment and verify its API routes and prepared cases without login.
2. Make the required short video or seven-slide deck, and keep its link separate from the app link.
3. Lead with a real temporal example: Epsilon Indi B motion, RW Aur brightness change, or the verified known-comet case. Use the repository's actual reported limits and uncertainties.
4. Explain the public benefit: a person can inspect real dated infrared observations, understand what changed, measure it, and check known objects without specialist archive software.
5. Include the five target validation records and be candid about saturation and the marginal WISE 0855 result. The SME reply supports this treatment.
6. Document DR1 scope, archive dependence, cached-data provenance, and SI assistance in the final project/submission.
7. Add all references, verify membership/eligibility and the event's deadline, and submit with time to verify success.
8. Treat a custom domain and QR3 expansion as optional follow-up work unless already complete and validated.

### Alignment already documented in COSMOS

| Need | Repository evidence | Research assessment |
| --- | --- | --- |
| Real multi-epoch images | README.md; Time Travel API/engine | Directly aligned with SME guidance. |
| Matched wavelengths, sky alignment, flags | README.md; docs/CHALLENGE_COVERAGE.md | Supports scientific validity; preserve explanatory limitations. |
| Named benchmark targets | README.md; docs/VALIDATION.md | Relevant, with honest per-target verdicts. |
| Repeatable demonstration despite archive failure | Prepared caches described in README.md and coverage guide | Valuable during the reported IRSA outages. |
| Accessible public workflow | Coordinate lookup, blink/swipe/difference, measurement and catalogue checks | Explain this workflow clearly in the demo. |
| Vercel architecture | web/next.config.ts; API Node runtimes; README deployment instruction | Suitable in principle; deployed behavior still needs checking. |
| All current releases | Release configuration explicitly DR1-only | State scope; QR3 support is not implemented by a DR1 refresh. |
| Demo, public access, references and SI declaration | Requirements found in official guides | Submission/deployment status was not established in this research. |

## 6. Later milestones and optional offers

The Judging & Awards Guide lists:

- Global Nominees: December 3, 2026.
- Global Finalists and Honorable Mentions: December 17, 2026.
- Global Winners: January 26, 2027.

The [offer announcement](https://github.com/nasa/spaceapps/discussions/2058) also lists Google Cloud, Microsoft/Azure/GitHub tools, Miro, and Meteomatics. All are optional. For COSMOS, cloud processing or collaboration tools may be useful if needed; weather data has no direct role in the documented astronomy workflow. Avoid adding a service just because a sponsor offers it.

## 7. Most useful links to keep

- [Official Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/)
- [Official Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/)
- [GO Team submission checklist #2260](https://github.com/nasa/spaceapps/discussions/2260)
- [GO Team resources and SI guidance #2123](https://github.com/nasa/spaceapps/discussions/2123)
- [GO Team optional-offer announcement #2058](https://github.com/nasa/spaceapps/discussions/2058)
- [GO Team domain-offer clarification #2116](https://github.com/nasa/spaceapps/discussions/2116)
- [SME multi-epoch guidance #2165](https://github.com/nasa/spaceapps/discussions/2165)
- [SME saturation confirmation #2282](https://github.com/nasa/spaceapps/discussions/2282)
- [Cutouts and wavelength discussion #1847](https://github.com/nasa/spaceapps/discussions/1847)
- [Archive outage thread and evolving updates #2183](https://github.com/nasa/spaceapps/discussions/2183)
- [Further outage context #2245](https://github.com/nasa/spaceapps/discussions/2245)
- [IRSA current data-access guide](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/)
- [IRSA SPHEREx overview](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html)
- [Vercel project domains](https://vercel.com/docs/domains/working-with-domains)
- [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
