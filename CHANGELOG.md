# Changelog

## [Unreleased]

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
