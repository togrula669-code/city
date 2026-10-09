## v0.4.1 — Media upload compatibility fix

- Fixed a false-negative file signature check for legitimate CRC-protected MP3 frame headers (`FF FA`) and supported MPEG variations.
- Added support for standard ID3v2 headers and MP4/M4A with a valid prefixed `free`/`skip` box.
- Normalized common browser MIME aliases (such as `audio/x-m4a`, `audio/mp3`, and codec parameters like `audio/webm;codecs=opus`).
- Kept file signature security checks; incompatible or unrecognized files are rejected with specific conversion guidance.
- Added seven media-signature regression tests, plus real FFmpeg-created MP3, M4A, and WebM checks.
- The exact cause of any individual upload still requires knowing the actual uploaded file; no API credential or live provider was used in these tests.

# CityPulse AI integrated frontend — changes from supplied ZIP

## Added
- English responsive dashboard, new-report wizard, interactive OpenStreetMap incident map, operations queue, system-health view, incident detail panel.
- File uploads and browser voice/video recording UI, structured AI review and duplicate-resolution UX.
- Media analysis routes for actual Gemini requests (text/image/audio/video, configuration/model dependent), with file-type signature and size validation.
- Database-derived dashboard summary endpoint.
- Authenticated prototype work order API and local repository persistence.
- `npm run demo:seed` for seven transparent synthetic Baku-area demo incidents.
- HTTP API contract tests (run when Express packages are installed), repository persistence tests and static frontend verification.
- Same-origin HTML/CSS/JavaScript hosting under existing `npm run dev` Express server, without Vite or separate client process.

## Deliberately not represented as complete
- Live AI connection without user credentials / quota checks.
- Original media evidence storage, transcoding/FFmpeg, cloud/Supabase adapter, production authentication, municipal integrations, actual Playwright E2E certification.

## v0.3.0 — Groq multimodal provider integration

- Added Groq API provider with JSON-format text incident analysis (`openai/gpt-oss-120b`).
- Added vision routing to `qwen/qwen3.8-27b` and audio transcription (`whisper-large-v3-turbo`) followed by structured text classification.
- Added explicit AI provider routing via `AI_PROVIDER`; unsupported Groq direct video either returns a clear error or explicitly routes to Gemini when `GROQ_VIDEO_FALLBACK=gemini` and credentials are configured.
- Improved validation, bounded network retry behavior, safe model/auth/rate-limit/format errors, safe diagnostic output, displayed active provider/model and voice transcript in review.
- Added CLI `npm run groq:models`, `npm run groq:test`, updated diagnostics, Turkish setup guide, and mocked Groq provider tests.
- Preserved map Referrer-Policy/CSP correction and existing frontend/backend integration.

## v0.4.0 — Hackathon stabilization

- Real bounded JPEG video-keyframe flow (including Groq vision request path); no claims about audio from video.
- Unicode/synonym/subtype heuristic duplicate matching; 12-case synthetic evaluation.
- Single-use analysis tickets and protection against concurrent replay; no forced merge.
- Redacted public incident records, admin-only details, optional local evidence archive and operator download.
- User-consented retention only; archive disabled by default.
- AI severity and rule-based operational level stored separately.
- Expanded regression tests and step-by-step Baku hackathon quick start.
- Known limitations and unverified integrations documented in HACKATHON_AUDIT.md.
