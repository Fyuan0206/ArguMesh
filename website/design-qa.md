# Homepage design QA

Reference: https://agentero.app/zh
Implementation: https://argumesh.nekocfy.com/

Scope is an ArguMesh adaptation of the reference's landing-page format, not an identical copy of Agentero's branding or product claims.

Initial review: both reference and implementation screenshots were emitted together in the same comparison call. Dark page, capsule navigation, centered serif brand and gray Chinese headline, paired CTAs and large product screenshot establish the requested hierarchy. Desktop captures had different actual output sizes despite viewport overrides; no pixel-perfect comparison is claimed.

P2 found: the initial Research Agent screenshot included an unconfigured-AI error. Replaced hero with the actual PDF reader screenshot. Reduced desktop hero spacing to bring the product preview higher. Replaced experiment empty-state screenshot with a populated example from existing QA assets. Subsequent production DOM and screenshot confirm the corrected hero and layout.

Functional checks: install navigation and clipboard copy succeeded in local browser. Mobile 390px DOM width check shows no horizontal overflow; responsive screenshot inspected. Production homepage and cloud workbench/API smoke checks passed. Browser screenshot calls are slow and occasionally time out; final production capture succeeded.

P3: matrix and research-thread screenshots show initial entry states; fuller demonstration screenshots would better communicate those capabilities. Flat dark background replaces the reference's decorative light texture. No unsupported Agentero features or binary downloads are advertised.

Final result: passed for the requested format adaptation. Exact pixel fidelity and exhaustive visual checks of every lower section are not claimed.
