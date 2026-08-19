# Approved decisions

## Environment strategy

- Local, staging, and production environments are separate.
- Local environment uses Firebase Emulator Suite.
- Staging and production will use separate Firebase projects.
- Firebase Hosting is the planned frontend hosting.
- Prioritize free-tier usage and low operating cost.

## Create Session

- `createSession` is an authenticated 2nd-gen Callable Function, backed by Firestore persistence.
- It accepts only a trimmed 1–24 visible-character display name and a target score divisible by 5 from 200 through 1000.
- It atomically creates `sessions/{sessionId}`, `sessions/{sessionId}/players/{uid}`, and private `sessionCodes/{code}` records. The host UID comes only from Callable Auth; sessions begin in `lobby` with `maxPlayers: 4`.
- Invitation codes are six uppercase unambiguous characters and are discovery only, not authorization.
- New sessions initialize authoritative `playerCount` and `playerNameKeys` concurrency fields. Names are unique within a session after trim, NFKC normalization, and lowercase comparison.
- `joinSession` accepts only a code and display name, derives the member UID from Callable Auth, and resolves the private code server-side. New members can join only a `lobby` with fewer than four players; existing members may resolve their existing membership without a count/name-key mutation, even after lobby status changes.
- `startSession` accepts only a safe session ID and derives the host from Callable Auth. It atomically performs the sole implemented state transition, `lobby` to `active`, only for the stored host at 2–4 players. There is no Ready state. The first transition writes trusted `startedAt` and `updatedAt`; an authorized retry while active is successful without rewriting either timestamp. New joins are blocked after start, but existing-member reconnect remains supported.
- Production Functions/Firestore region selection remains pending. App Check enforcement is a pre-production requirement. The UI suppresses obvious duplicate submissions, but `createSession` is not server-idempotent: a retry after an uncertain network result can create another lobby. Server-side idempotency remains deferred hardening if later justified.

## Not in this PR

- Turns, correction flow, game synchronization, host override, and reopen behavior. The first authoritative target-crossing score wins, atomically transitions the session from `active` to `finished`, and transaction ordering resolves concurrent crossings. Later scores are rejected and winner metadata cannot be replaced.
- Final Firestore schema and production deployment infrastructure.

## Identity/Auth 1A

- Firebase Auth uses explicit browser-local persistence and one centralized lifecycle observer.
- Local-persistence initialization failure is fail-closed: it exposes a recoverable application-safe error, blocks identity-requiring operations, and never silently falls back to ephemeral persistence or creates an anonymous replacement identity.
- Anonymous identity creation is lazy; application startup never creates an account.
- The application receives a small identity projection rather than raw Firebase users.
- Google redirect handling is contained in Firebase infrastructure. Signed-out users can start Google sign-in; anonymous users can link Google while retaining their Firebase UID. Permanent users do not relink or switch accounts in this milestone.
- Credential collisions never merge, delete, replace, or automatically sign in another Firebase identity. The anonymous identity stays usable and the application receives a controlled collision outcome.
- An anonymous-link redirect that returns a different UID is distinct from a normal credential collision: Cinque signs out the unexpected identity and enters its recoverable fail-closed Auth error state.
- No Google scopes beyond normal authentication are requested, and Cinque does not persist Google tokens, email, display name, or profile photo.
