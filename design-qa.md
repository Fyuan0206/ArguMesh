# ArguMesh Product Design QA

## Evidence

- Source visual truth: `C:\Users\24019\.codex\generated_images\01a039be-6931-7dd1-b2ab-ff7bf32ae914\exec-2cdd5507-87af-468f-b331-e960213759e4.png`
- Rendered implementation URL: `http://localhost:5173/projects/demo-occluded-pose`
- Implementation screenshots:
  - `design-qa-artifacts/agent-loaded.png`
  - `design-qa-artifacts/experiments-loaded.png`
  - `design-qa-artifacts/experiment-design-modal-refined.png`
  - `design-qa-artifacts/experiment-populated-design-v3.png`
  - `design-qa-artifacts/experiment-populated-analysis-v3.png`
- Intended viewport: 1047 × 698 desktop, matching the user's two annotated browser captures
- Implementation pixels / CSS size / density: 1047 × 698 at device scale factor 1
- State: Research Agent empty conversation, experiment empty state, and AI experiment-design modal

## Findings

- [Resolved P1] The native conversation selector/button cluster was replaced by a compact breadcrumb, project state, new-conversation action, and history popover. The 62/38 workspace split and mission rail remain stable at the annotated viewport.
- [Resolved P1] The experiment editor no longer renders as unstyled controls across the page. It now opens as a bounded, scroll-safe AI design dialog with research-question grounding and a clear generation scope.
- [Resolved P2] Shared `.outline` and `.icon-button` styles were added after the automated modal capture exposed browser-default cancel/close controls.
- [Resolved P2] Populated-table capture exposed a browser-default “重新分析” control; `.table-action` now has a compact, accessible secondary-action treatment.
- [Resolved P2] Experiment/result deep links now use immediate centered positioning. Smooth scrolling could leave fast navigation and screenshot capture at the experiment header instead of the cited result row.
- [Pending confirmation] The automated captures use headless Edge, not the exact in-app browser instance selected by the user. A refreshed user-browser screenshot is still required for final same-browser approval.

## Required Fidelity Surfaces

- Fonts and typography: visually checked at 1047 × 698; no clipping or unintended browser-default typography remains in the annotated surfaces.
- Spacing and layout rhythm: the Agent header, mission rail, experiment workflow, and modal were captured at the annotated viewport and remain bounded.
- Colors and visual tokens: the ink/teal research-workbench palette is consistent; violet is restricted to AI provenance and generation cues.
- Image quality and asset fidelity: Phosphor icons render cleanly at device scale factor 1; no raster UI assets are used on these surfaces.
- Copy and content: headings, helper text, and controls fit without collision in all three captures.
- Responsiveness and accessibility states: keyboard dialog handling and responsive CSS are implemented and covered by build/tests; only the annotated desktop viewport has pixel evidence.

## Full-view and Focused-region Evidence

- Full-view comparison: performed for the Research Agent and experiment empty state at 1047 × 698 using headless Edge.
- Focused region: performed for the AI experiment-design modal after temporarily creating and then deleting one research question. The project returned to zero research questions after capture.
- Populated experiment evidence: a temporary RQ, structured main design, two ablations, three imported CSV rows, cited AI analysis, and an append-only RQ conclusion were rendered and captured. The temporary experiment and RQ were deleted afterward.
- Not captured: populated conversation messages, history popover, and the user's exact in-app browser instance.

## Primary Interactions and Console

- Live HTTP smoke checks passed for health and the Research Agent, experiments, research-thread, and writing routes after restarting the local preview.
- Automated API/unit tests passed for the new workflows: 18 files and 82 tests.
- The Windows Computer Use runtime required for inspecting the user's chosen browser is not exposed in this tool session. A fixed-viewport headless Edge fallback was used for rendering evidence; interaction playback and console-error inspection in the user's browser remain unavailable.

## Comparison History

- Iteration 0: source visual identified; implementation route opened; comparison blocked before the first valid pass because a same-state implementation capture was unavailable.
- Iteration 1: the user supplied browser evidence at 1047 × 698 showing a crowded native select/button conversation header. The header was rebuilt as project breadcrumbs, project state, a flat new-conversation action, and a functional history popover.
- Iteration 2: the user supplied browser evidence at 1047 × 698 showing the experiment creation form with missing modal layout and native controls spread across the page. The page was rebuilt as an AI-first three-step workbench with structured design, ablation, imported-result, and AI-analysis tables; modal and responsive styles were added.
- Iteration 3: automated post-fix captures confirmed the redesigned Agent header, three-step experiment workbench, and modal layout. The modal capture exposed browser-default secondary/icon buttons; shared styles were added and a second capture confirmed the correction.
- Iteration 4: a fully populated experiment fixture confirmed main-design cards, two-row ablation table, analysis summary table, evidence chips, support status, and raw-data disclosure. It led to deterministic result deep-link scrolling and a refined table action.

## Implementation Checklist

1. Receive one refreshed post-fix screenshot from the user's chosen in-app browser.
2. Compare browser-specific font metrics and wrapping against the automated 1047 × 698 evidence.
3. If the user-browser capture exposes a remaining P0/P1/P2 issue, fix and recapture it.

## Follow-up Polish

- Populated conversation and result-table states can receive a later P3 polish pass once real project content exists.

final result: automated viewport QA passed; final same-browser confirmation pending
