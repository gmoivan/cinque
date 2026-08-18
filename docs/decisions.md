# Approved decisions

## Environment strategy

- Local, staging, and production environments are separate.
- Local environment uses Firebase Emulator Suite.
- Staging and production will use separate Firebase projects.
- Firebase Hosting is the planned frontend hosting.
- Prioritize free-tier usage and low operating cost.

## Not in this PR

- Session creation/join/start flows.
- Score registration, winner logic, correction flow implementation.
- Google sign-in implementation.
- Cloud Functions implementation.
- Final Firestore schema and production deployment infrastructure.

## Identity/Auth 1A

- Firebase Auth uses explicit browser-local persistence and one centralized lifecycle observer.
- Local-persistence initialization failure is fail-closed: it exposes a recoverable application-safe error, blocks identity-requiring operations, and never silently falls back to ephemeral persistence or creates an anonymous replacement identity.
- Anonymous identity creation is lazy; application startup never creates an account.
- The application receives a small identity projection rather than raw Firebase users.
- Future Google linking must preserve the existing Firebase UID. Credential collisions will not automatically merge accounts or data; that policy and UI are Identity/Auth 1B work.
