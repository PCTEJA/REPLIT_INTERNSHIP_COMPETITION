# HQPIXELS — ready-to-use implementation brief

Use this prompt with the attached HQPIXELS folder and original FLIP reference frames. This is a build instruction; the app is not already implemented.

---

Build **HQPIXELS**, a mobile-first task planner, using the **FLIP** visual direction. Use **HQ** as its compact mark. The user selected FLIP: ivory background, warm apricot cards, burnt-vermilion actions, sage accents, bold rounded sans type and tactile paper illustrations. Use the assets in `hqpixels/assets` and the precise tokens in `hqpixels/tokens.css`. Do not use the serif FOLIO visual style. Rebuild screens as real accessible components, never screenshot-based controls.

Read `PROJECT-BRIEF.md` and `BUILD-BACKLOG.md` completely. Treat the brief as the source of truth. Implement in small working milestones and report what is implemented, tested and still pending.

The main user journey is:

1. Speak multiple tasks in one recording, or type them.
2. Send the input through the server to Google Gemini.
3. Show the transcript and candidate tasks as a reviewable draft.
4. Allow conversational corrections such as “move the essay to Friday,” “remove the second task,” and “add grocery shopping.” Manual edits must remain available.
5. Let the user explicitly confirm the reviewed batch by saying “save these tasks” or pressing Save. Do not require checking every row.
6. Save all approved tasks atomically, then let the user find/start them by voice, such as “show today’s tasks” or “start the essay.” Keep tapping and optional swiping.

Use a React/TypeScript client, Node/TypeScript server and PostgreSQL persistence on Replit, adapting to current supported Replit services after checking documentation. Add authentication and enforce owner isolation. Use the Google GenAI SDK on the server. Configure provider model IDs in environment variables and verify audio, structured output and TTS support against the actual Google project. Never assume AI Pro gives unlimited free API usage. Never enable billing or switch to paid models automatically.

Store `GEMINI_API_KEY` in Replit Secrets. Never request it in chat or expose it in a client variable. If credentials are absent, finish the manual workflow and clearly label provider-dependent features as not connected. Do not simulate a successful live integration.

Begin with short recording turns: browser mic permission, a visible waveform/timer, explicit Stop & review, cancel and Type fallback. Maximum 60 seconds and 10 MiB, validated server-side. At the recording limit, stop locally and ask the user to continue; do not auto-upload. Detect actual audio MIME support and convert unsupported formats safely on the server. Stop microphone tracks on all exit paths. No always-on listening or fake live transcript.

Request structured draft output, then validate it server-side. Preserve source text and user timezone, flag unclear dates, leave missing dates/durations unset, and handle negation. An AI duration estimate must be labeled as a suggestion. Audio transcription is fallible and editable. Model output is data, not authority to call unrelated tools.

Separate draft creation from activation. Give drafts stable IDs and revisions. Use confirmation tokens tied to the current displayed revision and selection. A user’s fresh confirmation turn in review mode can authorize the batch; neither the initial brain dump nor assistant playback can authorize it. A mixed correction/save command must preview the revision and ask again. Reject stale edits. Deduplicate all mutations with operation IDs and request hashes. A database transaction either activates the full selected batch or none of it.

Add Google-generated read-back of the canonical draft on request. Playback errors must not prevent text review. Prevent assistant audio from entering the command recorder. Real-time Gemini Live is a later milestone using short-lived credentials or a server proxy; preserve the same confirmation logic.

Implement voice task lookup against the authenticated user’s saved tasks. Ask when names are ambiguous. Opening focus is not completion. Persistent rescheduling, deletion and completion require clear target review/confirmation and Undo where appropriate. Do not send email, invite buddies or write calendars just because a task mentions doing so.

Instrument real pipeline events: receive_input, validate_input, understand_input, validate_tasks, save_draft and render_review, plus separate confirmation/commit events. Persist and stream the same ordered events. Measure each step where it executes, label client render timing, and replay stored history without rerunning calls or writes. No fabricated performance numbers.

Preserve drafts on microphone, format, network, quota, provider and database failures. Offer manual text entry when Google is unavailable. A deterministic text parser cannot transcribe audio. Local-only saves must say “Saved on this device.” Release temporary audio promptly and protect transcripts/events from other users.

Build and test the P0 backlog first, including real mobile microphones, concurrency, idempotency, forbidden-user access, negative confirmation, date/timezone edge cases, failure recovery and replay without side effects. Test responsive layouts, keyboard controls, screen readers, reduced motion and text zoom. Publish only a build with durable persistence and verified secrets, and validate the final URL in a fresh browser.

Keep buddy/social features as the documented next phase unless current competition rules require them in the first submission. Native widgets require a separate native implementation. Do not claim any feature is complete until its behavior is verified.

At handoff, provide the actual running URL, startup/deploy instructions, database migration steps, environment variable names without values, tests executed, current limitations, and a short demo showing voice → correction → confirmation → persistence → voice task selection → run replay.
