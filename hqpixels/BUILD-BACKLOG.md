# HQPIXELS implementation backlog

Selected style: FLIP. Status: all build tasks below are **planned**, not implemented. Deliver a small working vertical slice before adding secondary features. Dependencies refer to IDs in this table.

| ID | Priority | Deliverable | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| HQ-01 | P0 | Project foundation, React/TypeScript client and server, build scripts | — | Local clean install/build; separate server secrets; README startup instructions |
| HQ-02 | P0 | HQPIXELS design system and responsive shell | HQ-01 | New brand assets, FLIP tokens, 360px/desktop/200% zoom review; consistent HQ mark |
| HQ-03 | P0 | Auth, user ownership and PostgreSQL migrations | HQ-01 | Two accounts cannot access each other’s tasks, runs or drafts; migration tested |
| HQ-04 | P0 | Persistent typed capture and manual draft editor | HQ-02, HQ-03 | Refresh preserves draft; multiline/manual entries work with provider disabled |
| HQ-05 | P0 | Google project capability check and server-only adapter | HQ-01 | Real audio/text/structured-output test with selected model, documented quota and lifecycle; no key in client bundle |
| HQ-06 | P0 | Microphone recorder and audio upload validation | HQ-02, HQ-05 | Mic granted/denied, silence, 60-second cap, cancellation, supported format and Safari/Chrome recordings tested |
| HQ-07 | P0 | Audio/text extraction with validated task schema | HQ-04, HQ-05, HQ-06 | Multi-task spoken input returns transcript and drafts; negation, missing dates and unknown durations handled |
| HQ-08 | P0 | Date/locale normalization and clarification | HQ-07 | Absolute date preview in user zone; next-Friday/AM-PM/DST ambiguity asks rather than silently inventing |
| HQ-09 | P0 | Voice and typed draft corrections with revision control | HQ-07, HQ-08 | Add/edit/remove/undo work; stale model result cannot overwrite a manual edit |
| HQ-10 | P0 | Batch summary and explicit confirmation | HQ-09 | All candidates reviewed together; save-all without per-row clicks; mixed edit-and-save requires revised summary |
| HQ-11 | P0 | Atomic idempotent task activation | HQ-03, HQ-10 | Double save creates one batch; interrupted request retry returns same result; failed transaction creates no partial batch |
| HQ-12 | P0 | Google read-back and accessible voice controls | HQ-05, HQ-10 | Read current canonical summary aloud; stop/mute; text still works when TTS fails; playback never becomes user input |
| HQ-13 | P0 | Voice task lookup, filtering and starting | HQ-11 | “Start the essay” opens matching saved task; duplicate names prompt; owner scope enforced |
| HQ-14 | P0 | Task deck, manual parity and focus | HQ-02, HQ-11, HQ-13 | Voice/tap optional swipe choose same task; keyboard works; start does not mark complete |
| HQ-15 | P0 | Explicit completion, reschedule and undo | HQ-14 | Confirm target; completion durable and reversible; repeated operations do not duplicate rewards |
| HQ-16 | P0 | Real run events, streaming, reconnect and replay | HQ-07, HQ-11 | Event sequence persisted; actual timing origins labeled; replay makes no provider calls or writes |
| HQ-17 | P0 | Limits, provider/storage recovery and local draft queue | HQ-06, HQ-09, HQ-11 | Tested 429/timeout/invalid JSON/offline/DB failure; same operation ID reused; manual mode remains usable |
| HQ-18 | P0 | Privacy controls, cleanup and session isolation | HQ-03, HQ-06, HQ-16 | Temporary audio cleaned; no content/secrets in ordinary logs; delete draft/history; sign-out clears user-local state |
| HQ-19 | P0 | End-to-end mobile and accessibility validation | HQ-12–HQ-18 | Real microphones in target browsers; keyboard/screen reader/zoom; voice corrections and batch save verified |
| HQ-20 | P0 | Replit production deployment and demo evidence | HQ-19 | Fresh-browser public URL, durable database, secrets configured, two different inputs, recovery and replay shown |
| HQ-21 | P1 | One-buddy invitation and aggregate progress | HQ-15, HQ-18 | Explicit invite/accept; private task titles by default; one reward per completion; no public leaderboard |
| HQ-22 | P1 | Gemini Live conversational mode | HQ-05, HQ-09, HQ-10, HQ-18 | Ephemeral credentials or server proxy, explicit active session, interruption/reconnect, same confirmation contract |
| HQ-23 | P2 | Calendar and reminder integrations | HQ-15, HQ-18 | Separate scopes, explicit destination/action review, idempotent external writes |
| HQ-24 | P2 | Native companion widget | HQ-20 | Separate native project/extension, privacy-safe display; do not promise PWA provides native widget |

## Suggested build milestones

1. **Foundation:** HQ-01–HQ-05. User can type, review and preserve a draft; the Google model capability test passes.
2. **Voice-to-draft:** HQ-06–HQ-09. One recorded sentence creates editable tasks, and a second turn corrects them.
3. **Review-to-action:** HQ-10–HQ-15. One confirmation saves the batch; a spoken task name starts the right task.
4. **Trust and submission:** HQ-16–HQ-20. Real events, failure recovery, privacy, mobile checks and published app.
5. **Expansion:** HQ-21–HQ-24 only after the core journey is dependable, or when explicitly required by the competition.

## Test scenarios that matter

| Scenario | Expected outcome |
| --- | --- |
| “Email Sam and buy milk. Don’t call Alex.” | Two candidates; no call task |
| “I might plan a trip, but I’m not sure yet.” | Clarification or optional draft; no invented commitment |
| “Outline essay tomorrow, email tutor, book room.” | Three drafts; only essay has a due date; no invented time estimates |
| “Remove number two.” after a reordered list | Applies to displayed revision; stale ordering rejected |
| “No, don’t save these.” | Nothing activated |
| “Move essay to Friday and save all.” | Updated preview; new confirmation required |
| Confirm revision 4 while another tab edits to revision 5 | Conflict; no stale commit |
| Repeat the same save after network timeout | Same three tasks, no duplicates |
| “Start essay” with two essay tasks | Disambiguation, no arbitrary selection |
| Assistant reads “save these tasks” aloud | No save; assistant output is not user authority |
| Switch to typing while extraction is in flight | New manual edit survives late response |
| Lose network before audio transcription returns | Honest retry/type path; no fabricated transcript |
| Database commit fails halfway | Zero active tasks from that batch, preserved draft |
| Replay a saved run twice | Same historical events; zero new provider calls/tasks |
| User B guesses User A’s draft/run ID | Denied without leaking draft content |

Do not mark a task done merely because its UI mockup exists. Attach actual build/test evidence when implementing it.
