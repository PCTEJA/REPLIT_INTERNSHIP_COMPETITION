# HQPIXELS

**Selected visual direction: FLIP. Compact brand: HQ.**

Open [the HQPIXELS gallery](hqpixels/index.html) to view the updated PNG designs. Read [the full project brief](hqpixels/PROJECT-BRIEF.md), [implementation backlog](hqpixels/BUILD-BACKLOG.md), and [Replit build prompt](hqpixels/REPLIT-BUILD-PROMPT.md).

The implementation is in [hqpixels-app](hqpixels-app/README.md). It includes manual capture, editable drafts, explicit batch confirmation, a task deck, focus timer, completion/reopening, history, local persistence, and an optional Google voice/assistant adapter. Manual mode is the default.

Run `npm ci` and `npm run dev` from `hqpixels-app`, then open http://127.0.0.1:3000. See its README for the manual walkthrough, Google configuration, Replit setup, and verification limits. Fourteen automated tests and the production build pass. Live Google task extraction, speech generation, and a synthetic audio-to-draft round trip passed on October 25, 2026. Physical microphone capture and PostgreSQL deployment remain unverified; no Replit deployment has been performed.

The original three-direction 60-frame study is retained in `design-frames` as historical reference. The generated HQPIXELS PNGs and full product specification remain in `hqpixels/`. The broader design backlog is not a claim that every planned feature is implemented.
