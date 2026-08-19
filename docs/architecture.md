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

`createSession` is a 2nd-gen Callable Cloud Function. It validates the authenticated caller and client-controlled name/target input, then atomically writes the lobby session, host membership, and private invitation-code lookup through the Admin SDK. Firestore is retained for later real-time lobby synchronization.

`joinSession` is a second authenticated 2nd-gen Callable. It resolves the private short code with the Admin SDK and transactionally reads the code mapping, session, and caller membership. New members may join only a lobby with fewer than four players; `playerCount` and `playerNameKeys` are the authoritative shared concurrency fields. Existing members resolve their original membership without consuming another slot, including after the lobby changes status.

`startSession` is an authenticated 2nd-gen Callable using that same Admin Firestore transaction boundary. Only the stored host may transition a valid 2–4-player `lobby` to `active`; it writes trusted `startedAt` and `updatedAt` timestamps. A host retry while already active returns the current result without rewriting timestamps. Because Start and Join transact on the same session document, their commits serialize: a new member either joins before activation or is rejected after it.

`recordScore` transacts the active session, caller membership, and immutable score entry together. On the first score whose new authoritative player total reaches the configured target, that same transaction writes `winnerUid`, `winnerDetectedAt`, `winningScoreCommandId`, `winningTotalScore`, and `status: 'finished'` on the session. Transaction retries are side-effect-free; concurrent crossings serialize through the session read, and the first commit establishes immutable winner metadata and the sole active-to-finished transition. New scores are rejected after finish, while an exact retry of an already persisted command remains a no-op and returns its stored outcome.

The client reaches callables and its one-off member-readable session refresh only through `src/infrastructure/firebase/sessions.ts`; React uses the application-facing session contract. This is not a gameplay synchronization layer. In local development the Functions SDK connects to the emulator with the existing HMR-safe boundary. Production builds never connect emulator endpoints.

## Authentication lifecycle

Firebase Authentication is contained in `src/infrastructure/firebase/authentication.ts` and exposes a small application-facing identity projection (`uid` plus anonymous/permanent kind). A single observer is started during Firebase bootstrap, after local emulator wiring, and is the source of truth for restored and changed authentication state.

Browser-local Auth persistence is configured explicitly before the observer starts. If that configuration fails, Auth enters the application-safe `error` state, does not start the observer, and does not fall back to session or in-memory persistence. Identity-requiring operations reject until an explicit retry or reload recovers initialization; the unauthenticated application shell remains available.

Anonymous users are created lazily through `ensureAnonymousIdentity()` only when a session flow needs an identity; loading Cinque never creates one. Google redirect sign-in/linking is also contained in that Firebase adapter: signed-out users begin a sign-in redirect, while anonymous users begin a link redirect. Redirect results are processed once during adapter startup and the centralized observer remains the source of truth for the resulting identity.

Anonymous-to-Google linking carries the anonymous UID through the redirect only to verify that Firebase preserved it. Credential collisions are surfaced as a sanitized application outcome; Cinque neither merges accounts nor signs in as the conflicting account.

An unexpected UID returned for an anonymous-link redirect is an authentication invariant violation, not a credential collision. Cinque signs out that unexpected Firebase identity and enters its recoverable fail-closed Auth error state; it does not claim recovery of the prior anonymous identity.
