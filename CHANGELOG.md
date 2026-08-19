# Changelog

- Added authoritative score-report creation: members can report another member's immutable score entry with a required reason and optional zero-or-five-multiple proposed value. Open-report locking, retry safety, client-write denial, report read exposure, and minimal pending-report UI are included; resolution/correction remains deferred.

## [Unreleased]

- Added winner detection and game finalization to the authoritative score transaction: the first committed score at or above target stores immutable winner UID, trusted detection timestamp, score command ID, and crossing total, atomically changes the session to `finished`, rejects new score commands after finish, and preserves exact winning-command retries as idempotent.
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
