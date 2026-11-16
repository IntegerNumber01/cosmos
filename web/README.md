# COSMOS web app

Next.js app with a TypeScript FITS/WCS measurement engine, prepared SPHEREx observations, and Node API routes for archive and catalogue access.

From this directory, using Node.js 22 LTS and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No API keys or Python backend are required. Featured investigations use committed observations; arbitrary sky positions and live catalogue checks depend on public archive services.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

The build regenerates the partial exposure index and validates prepared observation menus before compiling. Development uses `.next-dev/`; production uses `.next/`.

Deploy with `web/` as the project root and a Node runtime supporting the API routes' 60-second limit. See the [project README](../README.md), [contributor guide](../CONTRIBUTING.md), and [technical overview](../docs/TECHNICAL_OVERVIEW.md) for methods, data rebuilding, and limitations.
