# Changelog

## [Unreleased]

- Completed the first production deployment (`cinque-prod-gmoiv`) and verified the manual production smoke test successfully, confirming functional readiness in the final environment.
- Added fail-closed local/staging/production Firebase boundaries, explicit staging Hosting/Auth/Rules/indexes/Functions deployment, and production deployment denial.
- Integrated reCAPTCHA Enterprise App Check for staging clients and real-project Callables, structured security/TTL logging, and an ephemeral-token full staging smoke.
- Added PR validation and manual WIF staging deployment workflows, a staging-only billing alert, operational rollback/cost guidance, and production-readiness review.
- Upgraded Functions to Firebase Admin 14.3.0, reducing known moderate runtime findings from nine to seven without forced downgrades or unsupported overrides.

- Completed the Internet MVP gap set: realtime session projections with exact listener cleanup, shareable short-code links, Spanish/dark defaults with English/light per-device preferences, and a compact responsive game UI.
- Added server-authoritative 30-day anonymous-session retention with private Firestore TTL markers, verified recursive cleanup, persistent-member preservation, and owner-only recent-session discovery.
- Added host-only audited reopening with required reason, strict idempotency, historical winner/finalization preservation, and resumed correction/winner replay.
- Added focused unit, Rules, Functions, and full realtime emulator coverage plus a programmatic 94-requirement traceability check.

- Added authoritative score-report resolution: only the stored score owner can accept a corrected zero-or-five-multiple value or reject. Resolutions and accepted corrections are append-only and command-idempotent; active corrections replay authoritative history and may clear or replace detected winner metadata, while finalized sessions reject result-changing accepted corrections without reopening or partial writes.
- Added `finalizeGame`: only the stored host can atomically transition an active complete detected winner to `finished`; winner metadata is preserved and finalization is retry-safe by command ID.
- Finalization now fails closed while score reports are open, using the authoritative server-maintained `openScoreReportCount` updated by report creation and resolution.
- Added member-readable resolution/correction state, private-lock cleanup, minimal owner resolution UI, retry-after-resolution report regression coverage, and focused Functions/Firestore emulator validation.
- Added authoritative score-report creation: members can report another member's immutable score entry with a required reason and optional zero-or-five-multiple proposed value. Open-report locking, retry safety, client-write denial, report read exposure, and pending-report UI are included.

- Added winner detection separate from finalization to the authoritative score transaction: the first committed score at or above target stores the winner UID, trusted detection timestamp, score command ID, and crossing total while retaining `active`; later ordinary scores preserve that first winner and explicit host finalization uses `finalizeGame`.
- Added winner regression coverage for exact/exceeding target, non-host winners, retry/later-score immutability, concurrent crossings, and denied direct winner-field writes.
- Added Start Session: an authenticated 2nd-gen Callable that lets only the host atomically transition a valid 2–4 player lobby to `active`, writes trusted `startedAt`, and returns idempotently for host retries without rewriting it.
- Added Start/Join emulator coverage for authorization, minimum/capacity limits, active-state join blocking, existing-member reconnect, and transaction-race consistency; direct client status and timestamp mutations remain denied.
- Added Join Session: an authenticated 2nd-gen Callable that privately resolves invitation codes and transactionally adds lobby memberships with authoritative four-player capacity and normalized unique-name enforcement.
- Added reconnect-safe existing-member resolution, shared trim/NFKC/lowercase name normalization, and Create Session initialization of `playerCount` and `playerNameKeys`.
- Added minimal Join Session development UI plus real emulator coverage for membership reads, private code access, duplicate names, capacity races, and idempotent member retries.
- Added Create Session: an authenticated 2nd-gen Callable Function that atomically creates a lobby session, host membership, and private short invitation code.
- Added Functions emulator wiring, authoritative input validation, member-only session reads, denied client mutations/code access, and emulator integration coverage.
- Added a minimal Create Session development UI with lazy anonymous identity use; Join Session, game start, scoring, and synchronization remain deferred.
- Added Identity/Auth 1B: Google redirect sign-in, anonymous Google linking with UID verification, sanitized redirect outcomes, and explicit no-merge credential-collision handling.
- Documented the separate Firebase-project/provider, authorized-domain, auth-domain, and Hosting redirect prerequisites for a future staging/production rollout.
- Added Identity/Auth 1A: explicit browser-local Firebase Auth persistence, centralized auth-state lifecycle, recoverable fail-closed persistence errors, and lazy anonymous identity creation.
- Added focused auth lifecycle unit tests and an Authentication Emulator integration test that exercises the Cinque service.
- Deferred Google linking, credential-collision handling, and account/data merging to Identity/Auth 1B.

## [0.1.0] - 2026-08-17

- Initial project foundation with React + Vite + TypeScript.
- Firebase local emulator setup for Auth + Firestore + Emulator UI (`demo-cinque`).
- Fail-closed Firestore Security Rules and baseline rules tests.
- Initial modular source boundaries and placeholder Cinque screen.
- Initial project/product/security/architecture documentation.
