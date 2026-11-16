# Contributing to COSMOS

Use Node.js 22 LTS and npm for the web app. From `web/`, run `npm ci`, then `npm run dev`. The [technical overview](docs/TECHNICAL_OVERVIEW.md) documents the engine and scientific methods.

Before submitting a change, run from `web/`:

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

For browser checks, create a Python 3.12 virtual environment at `pipeline/.venv`, install `pipeline/requirements-browser.txt`, and run `python -m playwright install chromium` using that environment. Start the app, then run the relevant script in `pipeline/tools/` with its URL, for example `python pipeline/tools/guided_ui.py http://localhost:3000`. Activate the environment first, or use its Python executable directly. Browser artifacts belong in ignored `web/.qa/`.

Preserve the distinction between measured pixels and catalogue predictions. Changes to measurement methods should retain wavelength checks at the source position, flag handling, uncertainty estimates, refusals, and original observation provenance. Add a regression that exercises the scientific behavior being changed. Automated tests do not establish scientific novelty or human learning outcomes.

Keep the prepared data required by the offline cases in version control. Raw FITS downloads, virtual environments, build outputs, credentials, and personal participant records stay out of commits. See [archive resilience](docs/ARCHIVE_RESILIENCE.md) before regenerating caches, and inspect generated diffs before submitting them.

Report bugs through GitHub issues with the route or investigation URL, expected behavior, browser, and steps to reproduce. Remove personal notes and credentials from reports. For a suspected credential exposure, avoid posting the value in an issue.
