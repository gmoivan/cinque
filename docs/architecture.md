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

`recordScore` transacts the active session, caller membership, immutable score entry, and the complete persisted score ledger together. The ledger must have exactly one positive safe-integer sequence at every value from `1` through its entry count, and `nextScoreSequence` must equal that count plus one; malformed development sessions fail closed and must be reset rather than migrated. The session-owned `nextScoreSequence` then allocates each accepted command one unique, monotonically increasing entry `sequence`; timestamps and command IDs never define game chronology. Allocation, total mutation, and winner detection occur in the same transaction, so retries return the persisted sequence without advancing it and concurrent scores serialize through the session read. On the first score whose new authoritative player total reaches the configured target, that same transaction writes `winnerUid`, `winnerDetectedAt`, `winningScoreCommandId`, and `winningTotalScore` while retaining `status: 'active'`. Later ordinary scores remain active and cannot replace that first winner. This authoritative ordering makes winner detection deterministic and is the prerequisite for correction replay. New scores are rejected only after a separate finalization action; an exact retry of an already persisted command remains a no-op and returns its stored outcome. Validating the complete persisted ledger for every score command is intentionally a correctness-first MVP design: its read work grows approximately linearly with score-history size, which is acceptable for the current bounded Cinque game. Reconsider this approach if player count, target scores, correction history, or overall usage scale increase materially; no optimization is required now.

`reportScore` is an authenticated Callable that may report another member's immutable score entry only while the session is active. It creates an append-only `sessions/{sessionId}/scoreReports/{commandId}` audit record and a private `openScoreReports` transaction lock, so concurrent distinct commands cannot create two open reports for one entry. Its immutable-payload retry remains valid after that report is resolved or the session is finalized.

`openScoreReportCount` is a server-owned session aggregate. Report creation increments it in the same transaction that creates the open report and per-entry lock; either accepted or rejected resolution decrements it exactly once while resolving that report. `finalizeGame` transactionally reads the session and open-report query, fails closed if the count is malformed or inconsistent, and permits finalization only when the count is zero. This serializes report creation against finalization and prevents a finished session from gaining an open report.

`finalizeGame` is an authenticated Callable that accepts only a session ID and UUID command ID. It transacts the session document, permits only `hostUid` to transition `active` with complete winner metadata and no open reports to `finished`, preserves the winner tuple, and records trusted `finishedAt` plus `finalizationCommandId`. An exact command retry returns the stored finalization without a write; a different command after finalization fails closed. Finalization never changes report state.

`resolveScoreReport` is an authenticated Callable available to the authoritative score owner. While a session is active, an accepted resolution atomically records an immutable resolution and correction, replays the complete validated authoritative score sequence with the highest contiguous per-entry correction revision as the effective score, updates totals, and removes, replaces, or updates derived winner metadata without changing lifecycle status. A finished session is finalized: an accepted resolution fails closed with `session-finalized` and makes no audit, correction, score, winner, or lifecycle mutation. Rejections remain auditable and do not change scoring state. A host-authorized reopen command does not yet exist and remains a pending lifecycle task. Exact successful resolution retries are no-ops; changed command payloads and malformed ledgers fail closed.

The client reaches callables and its one-off member-readable session refresh only through `src/infrastructure/firebase/sessions.ts`; React uses the application-facing session contract. This is not a gameplay synchronization layer. In local development the Functions SDK connects to the emulator with the existing HMR-safe boundary. Production builds never connect emulator endpoints.

## Authentication lifecycle

Firebase Authentication is contained in `src/infrastructure/firebase/authentication.ts` and exposes a small application-facing identity projection (`uid` plus anonymous/permanent kind). A single observer is started during Firebase bootstrap, after local emulator wiring, and is the source of truth for restored and changed authentication state.

Browser-local Auth persistence is configured explicitly before the observer starts. If that configuration fails, Auth enters the application-safe `error` state, does not start the observer, and does not fall back to session or in-memory persistence. Identity-requiring operations reject until an explicit retry or reload recovers initialization; the unauthenticated application shell remains available.

Anonymous users are created lazily through `ensureAnonymousIdentity()` only when a session flow needs an identity; loading Cinque never creates one. Google redirect sign-in/linking is also contained in that Firebase adapter: signed-out users begin a sign-in redirect, while anonymous users begin a link redirect. Redirect results are processed once during adapter startup and the centralized observer remains the source of truth for the resulting identity.

Anonymous-to-Google linking carries the anonymous UID through the redirect only to verify that Firebase preserved it. Credential collisions are surfaced as a sanitized application outcome; Cinque neither merges accounts nor signs in as the conflicting account.

An unexpected UID returned for an anonymous-link redirect is an authentication invariant violation, not a credential collision. Cinque signs out that unexpected Firebase identity and enters its recoverable fail-closed Auth error state; it does not claim recovery of the prior anonymous identity.
