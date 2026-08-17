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
