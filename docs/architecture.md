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

## Authentication lifecycle

Firebase Authentication is contained in `src/infrastructure/firebase/authentication.ts` and exposes a small application-facing identity projection (`uid` plus anonymous/permanent kind). A single observer is started during Firebase bootstrap, after local emulator wiring, and is the source of truth for restored and changed authentication state.

Browser-local Auth persistence is configured explicitly before the observer starts. If that configuration fails, Auth enters the application-safe `error` state, does not start the observer, and does not fall back to session or in-memory persistence. Identity-requiring operations reject until an explicit retry or reload recovers initialization; the unauthenticated application shell remains available.

Anonymous users are created lazily through `ensureAnonymousIdentity()` only when a session flow needs an identity; loading Cinque never creates one. Google linking and collision/account-merging handling are deferred to Identity/Auth 1B.
