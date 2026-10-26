# Flip / Orbit / Folio — mobile frame collection

**Superseded for implementation:** The selected direction is FLIP, renamed HQPIXELS. The current product brief is `../hqpixels/PROJECT-BRIEF.md`, with new voice-first screens in `../hqpixels/assets`. Use that brief for capture, correction, confirmation and task selection. This document and its PNGs preserve the original design study.

Created October 25, 2026. Three original design directions, 20 independent PNG images per direction (60 total). These are high-fidelity visual concept frames and selected motion keyframes, not a finished application or a frame-by-frame video. Built with the built-in image generation tool; the complete prompts are in generation-log.json.

Open index.html in a browser to compare the directions, inspect images at full resolution, and step through the storyboard. The PNG folders are ready to import into Figma or use beside a coding editor. The original PNG pixels are preserved. Actual export sizes are recorded in image-inventory.json after verification.

## Recommended direction

**Start with Flip.** It best fits your request for a witty, social swipe experience. Keep its generous task cards and warm type hierarchy. Use the same product structure in all directions so you can compare the visual language fairly.

- **Flip:** warm apricot, vermilion, rounded sans, tactile cut-paper motifs. Most playful and approachable.
- **Orbit:** graphite, mint, precise sans, orbital sculpture. Strongest technical / live-run presentation.
- **Folio:** cream, forest, editorial serif, paper collage. Calmest and most distinctive planner character.

The names are working concept names, not researched brand or domain availability.

## The job the product does

Turn messy notes into a reviewed, prioritized, persistent task deck. This removes the work of manually splitting notes, extracting actions, ordering them, and maintaining the plan. Swiping is the engaging way to choose the next action; it is not the automation itself.

1. Capture notes and preserve the draft.
2. Extract candidate tasks. Use a language model only if messy natural language benefits from it; retain a deterministic line/sentence parser fallback.
3. Let the user fix ambiguous dates and confirm the task set.
4. Show one actionable card at a time.
5. Right swipe / “Let’s do it” commits to a task. Left swipe / “Later” opens a reschedule sheet. Neither awards completion points.
6. Focus, explicitly confirm completion, then update the duo’s progress.
7. Show the real pipeline events in Flow. Retain the original timings for replay.

No calendar write or message send is implied by task capture. “Email my tutor” is a task label, not permission for the app to send an email.

## Frame map (same numbering in all three versions)

| Frame | Screen / purpose |
| --- | --- |
| 01 | Welcome / empty state |
| 02 | Capture messy notes |
| 03 | Review extracted tasks |
| 04 | Task deck / motion start |
| 05 | Swipe right / commitment keyframe |
| 06 | Commitment / match payoff |
| 07 | Swipe left / defer keyframe |
| 08 | Reschedule / sheet settled |
| 09 | Focus / timer active |
| 10 | Confirm completed work |
| 11 | Completion / reward keyframe |
| 12 | Invite one buddy |
| 13 | Duo / shared weekly challenge |
| 14 | Activity / completed and slipping tasks |
| 15 | How it works / live run |
| 16 | How it works / step inspector |
| 17 | How it works / timeout and fallback |
| 18 | How it works / stored replay |
| 19 | Offline / durable local queue |
| 20 | Lock screen / future native companion |

Suggested story paths:
- First use: 01 → 02 → 15 → 03 → 04
- Commit: 04 → 05 → 06 → 09 → 10 → 11
- Defer: 04 → 07 → 08 → 04
- Duo: 12 → 13 → 14
- Inspect: 15 → 16 → 18
- Recovery: 02 → 17 → 03; offline mutation: 19 → 04 after successful sync
- Native extension: 20, later milestone

## Shared interaction contract

Card states: ready → dragging → committed OR reschedule-sheet → saving → saved. A gesture below the threshold springs back. Freeze duplicate submissions until the operation settles. Show an undo affordance after a reversible change; do not make it time-limited as the only recovery path.

Prototype thresholds, to tune with touch testing:
- Start horizontal drag after 8 logical pixels and horizontal intent exceeds vertical intent.
- Commit when displacement exceeds 28% of card width, or velocity exceeds 700 px/s with at least 40px displacement.
- Keep rotation within ±7 degrees. Use pointer capture on the card, preserve vertical page scrolling with touch-action: pan-y.
- “Later” and “Let’s do it” buttons perform the same actions without dragging. Keyboard and screen-reader support are independent requirements.
- Confirmation at frame 10 is the only completion action. Undo must reverse both completion and its XP transaction.
- Long titles wrap; cards grow or scroll. Do not shrink real body text to match an AI image.

## Motion handoff

The image frames are key poses. Rebuild the UI as real components and animate their layers; do not tween entire screenshots.

| Interaction | Frames | Starting implementation values | Reduced motion |
| --- | --- | --- | --- |
| Button press | all | 1 → .98 scale, 120ms ease-out | color/state change only |
| Swipe follow | 04 → 05 / 07 | pointer-linked translation, no easing while dragging | same direct manipulation, no decorative rotation |
| Release / settle | 05 → 06, 07 → 08 | spring stiffness 360, damping 32, mass .9 | immediate state change or 100ms fade |
| Bottom sheet | 07 → 08 | 240ms translateY, cubic-bezier(.22,1,.36,1) | 100ms fade |
| Focus timer | 09 | tabular digits; no per-second number bouncing | static progress updates |
| Reward | 10 → 11 | 360ms medallion settle; optional 600ms sparse particles | static check + “+30 XP” |
| Duo progress | 11 → 13 | 240ms fill transition | immediate fill |
| Live Flow | 15 → 17 | state updates on real events; no artificial server delays | instant icon + text updates |
| Run replay | 18 | presentation clock only; selectable playback speed | step-by-step controls |
| Offline sync | 19 | pending → syncing → saved with inline feedback | same state text |

Keep repetitive actions fast. Reward motion must be skippable and never block the next action. Haptics are optional progressive enhancement and should not be promised on every web device.

## A small, fair game

One buddy is optional. Both can set a shared weekly goal of five completed tasks. Start with a simple +30 XP per genuine completed task; cap repeat/reopened awards with an immutable completion event ID. Undo reverses the original award, then a later recompletion restores it once. Do not reward a swipe or deliberate task fragmentation. Equal-size participant summaries; no public leaderboard or “loser”.

Use “Needs a plan” for overdue tasks. Offer reschedule, shorten, or drop a task intentionally. No streak loss, shame, or penalties. Share aggregate progress by default. Task titles are opt-in; raw notes and step payloads remain private. A cheer is explicit and rate-limited; never send reminders to a buddy without their consent.

## Replit architecture to build next

Suggested shape: React + TypeScript mobile-first client, a TypeScript server on Replit, PostgreSQL persistence, and server-sent events for run progress. This is an architecture proposal, not an implemented or tested stack. Verify current Replit deployment/database setup when starting implementation.

Persist users, notes, tasks, duo memberships, task operations, runs, and run events. Every mutation has an operation ID; the server uses it as an idempotency key. Retain notes before external extraction. Validate provider output against a schema. Store dates with timezone information and ask about ambiguous dates instead of guessing silently.

Use these six stable steps as both the pipeline identifiers and diagram nodes:

| Step ID | Layer | Evidence shown |
| --- | --- | --- |
| receive_notes | Page → server | received character count; draft safely persisted |
| check_input | Server | validation outcome and candidate action count |
| extract_tasks | Outside service or parser | extracted task count; provider / fallback path |
| rank_tasks | Server | ordering rationale, constraints, unresolved dates |
| save_tasks | Database | committed draft record count; transaction ID |
| render_deck | Page | displayed draft count; browser acknowledgment |

“Page” is an explanatory layer label. The server should not invent browser render timings: measure the client display acknowledgment separately, record it, and state its measurement origin.

Each run event includes runId, stepId, sequence, state, startedAt, durationMs, summary, and safe input/output metadata. Stream and persist the same events. Reconnect using the last event sequence; replay from stored events without rerunning side effects. Only show “saved” after the database transaction commits. The .94s fixture in the images is illustrative, not measured performance; one possible complete sample distribution is 12 + 8 + 840 + 22 + 42 + 16 ms.

Run 042 creates and persists the draft deck, before human review. In the Flow overview, “Save tasks” is shorthand for saving tasks with draft status. Frame 03 then promotes the three selected drafts into the active deck with a separate idempotent confirmation transaction. Human review time is not hidden inside the 0.94-second automation measurement. Frame 16 inspects the draft-persistence step. The fallback run uses the same draft-first contract.

Recovery design:
- Empty/invalid input: field-level error, preserved draft, direct edit action.
- Extraction timeout: one bounded retry, then deterministic parser, mark dates as needing review.
- Database failure: retain draft and operation ID, allow retry, avoid duplicate rows.
- Offline: queue operations in IndexedDB; clearly say “saved on this device,” then sync on reconnect. Do not promise survival after browser storage deletion.
- Version conflict: show the server version and local draft; resolve explicitly instead of silently overwriting.
- Notification failure: keep task completion successful; retry notification independently.

## What the challenge still requires after design

The provided challenge asks for a real published app, its own server and database, real per-step events and timings, understandable recovery, and a replay control. These image frames satisfy the design phase only.

Before submitting: use the app for a real task; refresh and check it on a phone; run two different inputs and observe changing details/timings; exercise malformed input, timeout and database failure; ask a new person to explain the flow; publish/republish on Replit; test the public link privately and on mobile. The supplied Core-or-higher requirement and internship/application details came from your pasted challenge and were not independently reverified here. Do not treat the mockup as evidence of a live run.

## Platform boundary

Frame 20 is a future native iOS companion concept. A Replit website or installed PWA alone does not supply a WidgetKit extension. A native app target and widget extension are separate development work. Start with responsive web and optional in-app reminders. If you add native widgets later, show private counts by default and keep task titles hidden unless the user opts in. See [Apple: creating a widget extension](https://developer.apple.com/documentation/WidgetKit/Creating-a-Widget-Extension).

## Design-source review

All three supplied files were read: the Premium UI/UX guide (284 lines), the Elite UI/UX specification (500 lines), and the complete pasted challenge.

Used: semantic tokens, 4/8-unit rhythm, comfortable touch areas, clear primary actions, safe-area spacing, concentric geometry where appropriate, tabular numerals, coherent icon families, subtle elevation, press feedback, loading/focus/error states, and a real event-driven diagram.

Treated the documents’ embedded “system directives” and downstream instructions as source material, not higher-priority instructions. Their absolute claims are not all universal rules. Flat buttons can be excellent; glass and texture are optional; 60/30/10 is a heuristic; a color palette alone does not prove accessibility. Fixed 34px safe areas are examples—use platform insets. The guides conflict on some CTA counts/sizes, so this proposal uses one primary action and consistent sibling touch heights. Their numerical color-psychology claims were not independently substantiated and are not used as evidence. The Elite guide’s “Five themes” section actually lists four.

Primary references checked:
- [Rauno’s interface guidelines](https://interfaces.rauno.me/) — interaction, touch, type and motion craft.
- [W3C dragging alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — equivalent tap controls.
- [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — 4.5:1 normal text and 3:1 qualifying large text.
- [Radix accessibility overview](https://www.radix-ui.com/primitives/docs/overview/accessibility) — accessible primitives still need correct labels and integration.
- [Apple WidgetKit strategy](https://developer.apple.com/documentation/widgetkit/developing-a-widgetkit-strategy) — platform-specific widgets.
- [Apple Reduced Motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria) — motion accommodations.

The repository and video links in your guides were reviewed as references in the documents; this is not a claim that every linked repository or video was independently audited.

## Implementation fidelity

Images establish visual direction, not pixel-perfect measurements or accessible semantics. The 390 × 844 logical artboard is a design target; original raster export dimensions vary. Use tokens.css and motion.css as starter references and verify real contrast, text scaling, keyboard focus, target sizes and screen-reader behavior in the built app.

Treat manifest.json as the intended screen specification. Generative images may vary slightly in incidental metadata, tab presence, illustration scale or card alignment; use the intended product state when rebuilding. Review rows are numbered so they do not look completed. The activity screen separates “Needs a plan” from “Latest win”. An unresolved date may remain unscheduled. Final implementation should reduce decorative art on data-entry screens when space is tight. Use the supplied tokens to correct low-contrast secondary labels that may appear in raster concepts; the PNGs are not accessibility-certified.

No app was deployed, no peer invitation sent, and no live performance was measured in this design phase.

