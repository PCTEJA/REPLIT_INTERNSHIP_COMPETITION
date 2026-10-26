# Delivery notes

**Current selection:** FLIP has been selected and the project is named HQPIXELS. Open `../hqpixels/index.html` for the updated branding and voice-first core screens; `../hqpixels/PROJECT-BRIEF.md` is the current implementation specification. This 60-frame collection is the original design study.

Start by opening index.html. It is a self-contained local gallery: no install or account required. It uses the original PNGs in the three sibling folders. Keep those folders next to the HTML file.

- Browse a direction: view all 20 frames or filter by journey.
- Compare one frame: put the same screen from Flip, Orbit and Folio next to each other.
- Click a frame: inspect the original, download it, or step through a storyboard.
- Storyboard playback advances still images; it is not a running app or animation sprite sheet.
- For the application build, read DESIGN-HANDOFF.md, tokens.css and motion.css.
- generation-log.json contains the exact generation prompt and original source path for each final frame.
- manifest.json contains the intended screen specification, with visual QA corrections reflected.
- image-inventory.json records the file hashes, dimensions and image validation results.
- FRAME-INDEX.csv is a spreadsheet-friendly index of all 60 individual PNGs.
- QA-NOTES.md explains what was checked and the remaining implementation limits.
- token-contrast-check.json checks the supplied CSS token pairs, not the pixels in the AI-generated images.

Names are working names. The artwork was generated with the built-in image generation tool. Every final frame is an individual file; no contact-sheet slicing is required.

Local gallery preview URL while its local server runs: http://127.0.0.1:8766/
The local index.html remains usable after the preview server stops.

These concept frames are a design deliverable. No Replit application, server, database, real run trace, invitation or native widget has been implemented here.

