# Architecture foundation

## Layer boundaries

- `src/app`
- `src/domain`
- `src/application`
- `src/infrastructure/firebase`
- `src/features`
- `src/i18n`
- `src/styles`
- `src/test`

The domain layer must remain independent from React, Firebase/Firestore, browser APIs, and infrastructure details to keep future reuse possible (for example Android/LAN variants).

## Firebase architecture decision

Sensitive mutations will use Callable Cloud Functions as the authoritative command layer.
Firestore remains the persistence and real-time synchronization layer.

Cloud Functions are intentionally not implemented in this foundation PR.
