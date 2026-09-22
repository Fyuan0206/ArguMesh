# ArguMesh public website

Static marketing homepage inspired by https://agentero.app/zh. Source lives in the main ArguMesh repository; the local research application and its Node/SQLite runtime are unchanged.

Preview from repository root: `python -m http.server 4173 --directory website`.

Production hosting is separate from the local application. Run `node website/prepare-hosting.mjs`; it prints a temporary Wrangler configuration path. Deploy that configuration with an authenticated Wrangler CLI (`wrangler deploy --config <printed-path>`). No cloud package is required by the ArguMesh application.

Only index.html and website-assets are staged as public assets. The website Worker serves `/` (including query strings) and `/website-assets/*`. Other requests are forwarded through a service binding to the existing `paperidea-workbench`, preserving authentication, APIs and deep links. The old Worker retains the custom domain; the website owns the more specific zone route `argumesh.nekocfy.com/*`.

Rollback: remove that website zone route to restore the previous homepage. Do not remove the underlying custom domain. Never deploy the local unauthenticated Node application as the public backend.

Assets come from the repository's public branding and docs/screenshots; experiments.png comes from design-qa-artifacts/experiment-populated-analysis-v3.png. Screenshots show example data and initial product states. Reader screenshot is reused for the hero. Website code and deployment adapter are not served as public files.
