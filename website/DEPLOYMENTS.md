# Website deployments

## 2026-09-13 — Agentero-inspired ArguMesh homepage

- Worker: `argumesh-website`; version `4d761fe5-2a2d-40cd-98f4-6da6b24f18bb`.
- URL: https://argumesh.nekocfy.com/
- Change: dark capsule navigation, centered brand hero, product screenshot, five research stages, feature grid, install instructions and copy command button.
- Scope: static website in this repository. Existing cloud workbench receives all non-website requests via a service binding. No application deployment, database migration, credential changes or data edits.
- Verification: homepage and query-string homepage 200 with new content; /projects 200; /api/health 200 with ok=true; CSS and hero image 200. Production page inspected through in-app browser DOM and screenshot.
- Local website checks: primary anchor navigates to installation; command copy reports success; responsive 390px viewport has no horizontal overflow (375px document width including scrollbar allowance). Desktop and install section visually inspected.
- Main application checks: typecheck and build passed; test rerun exited 0 with 24 files / 98 tests passed. Initial test run displayed passing tests but returned a nonzero lifecycle status; explicit rerun resolved it. Existing build bundle-size warning remains.
- Rollback: remove the zone route `argumesh.nekocfy.com/*` owned by argumesh-website. Keep the original custom domain on paperidea-workbench.
- Source files are local and have not been committed or pushed to GitHub in this task.
