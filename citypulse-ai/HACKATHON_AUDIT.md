# CityPulse AI v0.4.0 — Engineering Audit & Hackathon Release Notes

## Completed in this revision

- Unicode-aware Azerbaijani/Turkish/English infrastructure synonym normalization in geographic duplicate matching.
- Optional same-incident-subtype flagging for nearby reports with dissimilar wording; *always human review*, never forced merge.
- Fixed reusable incident analysis tickets, including a concurrency guard around duplicate lookup and incident creation.
- Public incident responses redact citizen descriptions, AI evidence internals, precise coordinates and individual non-sample titles. Full records require operator authentication.
- Supporting a duplicate no longer exposes the full source incident data to the anonymous user.
- Caller-controlled corroboration source IDs no longer drive priority escalation (cannot prove independence).
- Video sample extraction module uses up to three real JPEG frames rather than pretending Groq can ingest full video.
- Optional explicit-consent local evidence archiving and protected operator downloads. Video-frame workflow archives one representative frame, **not** the original movie or audio.
- AI severity remains distinct from calculated operational-priority level in saved records.
- New mocked Groq multi-frame test, multilingual duplicate regressions, local evidence archive test, and additional HTTP integration assertions.
- A small reproducible synthetic duplicate-method benchmark (`npm run evaluate:duplicates`).

## Results actually confirmed in the provided evaluation environment

- `node --test`: tests execute; summary is in the final release verification log.
- `npm run verify:frontend`: source syntax, resources and static API wiring checks.
- `npm run evaluate:duplicates`: 12 **synthetic** positive/negative examples; this is not operational field accuracy.
- `node --check`: updated JavaScript parses.

## Not fully validated here

- Live `npm run dev`/HTTP contract: external Express, Helmet and CORS packages could not be installed in this restricted runtime; the HTTP integration test is skipped until normal `npm install` is performed.
- Live Groq/Gemini authentication, provider models, quotas and actual media response quality: user secrets are not included, so **not verified**.
- Full browser integration: local browser network access was blocked by environment policy. Frontend syntax and wiring tests still run.
- Video codecs and browser camera permission: dependent on end-user browsers/devices and must be tested on site.
- No true AI classification precision/recall was measured using real independently labeled media.
- Leaflet base-map tiles depend on internet and external tile server policies.
- Single-instance JSON persistence, not Supabase or a multi-instance production cloud database.

## Critical checklist for October 9 live demonstration

1. On the actual Windows laptop: `npm install`, `npm run check`, `npm run dev`.
2. Open `http://localhost:3001` in a browser with working network. Verify Overview, Report, Map, Operations, System Health.
3. Put keys **only** in `.env`; check `npm run groq:models`, `npm run groq:test`, and provider account free-tier limits.
4. Submit one text and one JPEG report with a real provider. Verify database saves the incident.
5. Submit one real WebM/MP4 video ≤30 s. Confirm browser decode, frame extraction, Groq vision model acceptance, and no claim to analyze soundtrack.
6. Upload/record audio and verify speech transcription (provider/browser formats may vary).
7. Test one nearby duplicate and one unrelated report; verify no automatic merging.
8. Configure a strong `ADMIN_TOKEN`, unlock operator, change a status, create and progress a work order.
9. If private evidence retrieval is needed: set `EVIDENCE_STORAGE=local` **before startup**, opt in during report upload, then verify an operator can download evidence and an unauthorized user cannot.
10. Run the official demo once without changing code, then record the actual outcomes and known limitations in the pitch.

## Open issues and security limits

- Demo operator access uses a static token and browser sessionStorage; replace with robust login, audit logs, secret rotation and multi-tenancy before real deployment.
- AI-derived urgency is a recommendation, not verified emergency dispatch intelligence.
- Synthetic duplicate tests are small and hand-crafted; mixed-language similarity still needs a real dataset and possible semantic embeddings.
- No upload virus scanning, EXIF sanitization workflow, retention scheduler, or full data-subject access controls. Only use consented/synthetic media.
- Dynamic generation of OpenStreetMap tiles depends on a third-party public service. Respect attribution and fair-use limits.
- Browser keyframes omit soundtrack and motion details between sampled timestamps.
- Health checks confirm configuration, not model permission or live API success.
- Opt-in media archiving uses server-local disk and has no automatic cleanup after incident creation. Keep it off by default.

**Do not present this MVP as fully production-ready or 100% failure-proof.**
