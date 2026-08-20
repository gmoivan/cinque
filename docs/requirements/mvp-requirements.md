# Cinque MVP Requirements

This document specifies the authoritative, verifiable requirements for the initial MVP Internet release of Cinque.

## Traceability Summary

| Domain | Total | Implemented | Partial | Missing | Deferred | Decision Required |
|---|---|---|---|---|---|---|
| **Scope** | 7 | 4 | 0 | 0 | 3 | 0 |
| **Identity / Auth** | 7 | 6 | 0 | 1 | 0 | 0 |
| **Sessions** | 14 | 12 | 0 | 2 | 0 | 0 |
| **Realtime Sync** | 7 | 0 | 0 | 7 | 0 | 0 |
| **Scoring** | 9 | 9 | 0 | 0 | 0 | 0 |
| **Score Reports** | 23 | 23 | 0 | 0 | 0 | 0 |
| **Winner Lifecycle** | 15 | 14 | 0 | 0 | 0 | 1 |
| **UI/Product** | 5 | 0 | 1 | 4 | 0 | 0 |
| **Architecture / Security** | 7 | 5 | 0 | 0 | 2 | 0 |
| **Totals** | **94** | **73** | **1** | **14** | **5** | **1** |

| Coverage | Total |
|---|---|
| **Direct** | 68 |
| **Indirect** | 2 |
| **None** | 24 |
| **Total** | **94** |

---

## Scope

* **REQ-SCOPE-001** — Cinque MUST accompany a physical Domino Five game as a score companion.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` implements session, score, report, and winner controls without a digital playing surface.
* **REQ-SCOPE-002** — The current MVP MUST require Internet connectivity.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Indirect
  * *Evidence:* `src/infrastructure/firebase/config.ts`, `src/infrastructure/firebase/sessions.ts`, and `functions/src/index.ts` depend on hosted Firebase services outside local development.
* **REQ-SCOPE-003** — LAN or offline operation MUST remain outside the current MVP.
  * *Priority:* Post-MVP
  * *Status:* Deferred
  * *Coverage:* None
  * *Evidence:* No LAN or offline transport exists in `src/` or `functions/src/`.
* **REQ-SCOPE-004** — Bluetooth and Android-specific peer connectivity MUST remain outside the current MVP.
  * *Priority:* Post-MVP
  * *Status:* Deferred
  * *Coverage:* None
  * *Evidence:* No Bluetooth or Android-specific peer transport exists in the repository.
* **REQ-SCOPE-005** — The MVP MUST NOT reconstruct or simulate the physical domino board.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` contains no board model, board renderer, or tile simulation.
* **REQ-SCOPE-006** — The MVP MUST NOT implement automated physical tile recognition.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* None
  * *Evidence:* No image capture, computer-vision, or tile-recognition implementation exists in `src/` or `functions/src/`.
* **REQ-SCOPE-007** — AI gameplay features, advanced statistics, monetization, matchmaking, and unrelated social features MUST remain outside the current MVP.
  * *Priority:* Post-MVP
  * *Status:* Deferred
  * *Coverage:* None
  * *Evidence:* The repository contains no implementation for these excluded product areas.

## Identity / Auth

* **REQ-AUTH-001** — Anonymous authentication MUST be the default entry method.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:auth`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`
* **REQ-AUTH-002** — Google sign-in MUST be available as an option.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`src/test/unit/firebase-authentication.test.ts`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`
* **REQ-AUTH-003** — A Google-authenticated user MUST retain a persistent Firebase identity across browser sessions according to the configured authentication persistence.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`src/test/unit/firebase-authentication.test.ts`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts` configures `browserLocalPersistence` before observing authentication state; its unit tests verify restoration of an existing permanent identity.
* **REQ-AUTH-004** — A persistent user MUST be able to discover or recover their prior Cinque sessions without already knowing each session ID.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* No user-to-session index, session-history query, recent-session persistence, or history UI exists; `src/infrastructure/firebase/sessions.ts` reads only a caller-supplied session ID.
* **REQ-AUTH-005** — A player identity MUST be associated with their session membership.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-AUTH-006** — Anonymous identity creation MUST be lazy (only created when needed).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`src/test/unit/firebase-authentication.test.ts`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`
* **REQ-AUTH-007** — Credential collisions during Google linking MUST NOT merge, delete, or replace the anonymous identity silently.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`src/test/unit/firebase-authentication.test.ts`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`

## Sessions

* **REQ-SESSION-001** — A player MUST be able to create a session with a target score divisible by 5 from 200 through 1000.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-002** — Session creation MUST require a valid host display name.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-003** — The session target score MUST be fixed before gameplay begins.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-004** — All players MUST begin with a zero accumulated score.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-005** — A session MUST support invitation by a 6-character short code.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-006** — A session MUST support invitation via a shareable join link.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` lacks URL routing/sharing logic for links.
* **REQ-SESSION-007** — Display names MUST be enforced as unique within a session using trim, NFKC normalization, and lowercase comparison.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-008** — A player MUST be able to join a lobby using a valid short code.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-009** — A session MUST admit no more than 4 players.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-010** — Existing members MUST be able to reconnect or resolve membership without consuming an additional seat.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-011** — New players MUST NOT be able to join after the lobby becomes active.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-012** — Only the session host MUST be able to start the game (transition from `lobby` to `active`).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:start-session`)
  * *Evidence:* `functions/src/startSession.ts`
* **REQ-SESSION-013** — A session MUST NOT be startable if there are fewer than 2 players.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:start-session`)
  * *Evidence:* `functions/src/startSession.ts`
* **REQ-SESSION-014** — Anonymous sessions MUST have a 30-day retention requirement enforced.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* No automated TTL indices, cron jobs, or infrastructure mapped to this cleanup.

## Realtime Synchronization

* **REQ-SYNC-001** — Session membership updates MUST be visible in realtime to connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh; no active `onSnapshot` listeners.
* **REQ-SYNC-002** — Session lifecycle-state updates MUST be visible in realtime to connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh; no active `onSnapshot` listeners.
* **REQ-SYNC-003** — Score updates MUST be visible in realtime to all connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.
* **REQ-SYNC-004** — Winner changes MUST be visible in realtime to all connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.
* **REQ-SYNC-005** — Finalization changes MUST be visible in realtime to all connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.
* **REQ-SYNC-006** — Score-report state updates MUST be visible in realtime where authorized.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.
* **REQ-SYNC-007** — Score-correction state updates MUST be visible in realtime where authorized.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.

## Scoring

* **REQ-SCORE-001** — An active member MUST be able to record a score for their own identity.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-002** — An accepted score value MUST be a positive multiple of 5.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-003** — An authenticated session member MUST NOT be able to record a score for another player's identity.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-004** — Score entries MUST be immutable once recorded.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-SCORE-005** — Score recording MUST be idempotent by client command ID.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-006** — Each accepted score command MUST be assigned exactly one server-generated per-session sequence number.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-007** — Concurrent score submissions MUST serialize deterministically via the session read boundary.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-008** — Direct client writes to score entries MUST be denied by default.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-SCORE-009** — The append-only scoring ledger MUST preserve its full audit history.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`

## Score Reports

* **REQ-REPORT-001** — A member MUST be able to report another member's score entry for correction.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-002** — A member MUST NOT be able to report their own score.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-003** — A report reason MUST be required.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-004** — A proposed corrected value MUST be optional.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-005** — A provided proposed corrected value MUST be 0 or a positive multiple of 5.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-006** — A score entry MUST NOT have more than one open report at a time.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts` and `src/test/integration/report-score.emulator.test.ts` verify server-side duplicate prevention, including concurrent attempts.
* **REQ-REPORT-007** — Authorized session members MUST be able to observe that a score entry already has an open report.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`, `src/test/unit/app.test.tsx`)
  * *Evidence:* `firestore.rules` permits member reads, `src/infrastructure/firebase/sessions.ts` projects reports onto score entries, and `src/app/App.tsx` renders the open-report state.
* **REQ-REPORT-008** — Only the owner of the reported score MUST be able to resolve it.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-009** — A resolution reason MUST be optional.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-010** — Report creation retries MUST be idempotent.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-011** — Resolution retries MUST be idempotent.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-012** — An accepted correction MUST produce a new append-only correction event.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`; original score-entry immutability is tracked separately by `REQ-SCORE-004`.
* **REQ-REPORT-013** — Rejection of a report MUST produce no score correction.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-014** — Direct unauthorized mutation of report audit state MUST be denied.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-REPORT-015** — Direct unauthorized mutation of correction audit state MUST be denied.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-REPORT-016** — New reports MUST be blocked once the session is finished.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-017** — Accepted corrections MUST be blocked once the session is finished.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-018** — Rejection of a report after finalization MUST remain allowed under current semantics.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-019** — Inconsistent `openScoreReportCount` MUST never be silently repaired or coerced.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-REPORT-020** — Creating a report MUST increment the session's consistent open report count by 1.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-021** — Resolving a report MUST decrement the session's consistent open report count by 1 exactly once.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-022** — Report-creation transaction failures MUST NOT leave partial mutations.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-023** — Report-resolution transaction failures MUST NOT leave partial mutations.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`

## Winner Lifecycle

* **REQ-WINNER-001** — The session MUST record the winner when a score causes a player to reach or exceed the target.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-WINNER-002** — Winner metadata MUST be derived from the authoritative chronological score order (the assigned sequence).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`, `test:resolve-score-report`)
  * *Evidence:* `functions/src/recordScore.ts`, `functions/src/resolveScoreReport.ts`
* **REQ-WINNER-003** — Reaching the target MUST NOT automatically finalize the session.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-WINNER-004** — Ordinary scoring after detection MUST NOT replace the first detected winner.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-WINNER-005** — Winner metadata MUST be recomputed from authoritative chronological history after an accepted correction while the session is active.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts` may clear or change winner metadata according to the replay result.
* **REQ-WINNER-006** — Explicit finalization (`finalizeGame`) MUST be allowed only for the host.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-WINNER-007** — Explicit finalization MUST require an existing detected winner.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-WINNER-008** — Explicit finalization MUST transition the session state from `active` to `finished`.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-WINNER-009** — Explicit finalization MUST preserve the existing winner tuple without altering it.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-WINNER-010** — Finalization MUST be blocked while any score report remains open.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-WINNER-011** — Finalization MUST preserve score-report audit state.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-WINNER-012** — Once a session is finished, new scoring MUST be blocked.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-WINNER-013** — Accepted corrections MUST be blocked once the session is finished.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-WINNER-014** — A finalized game MUST NOT reopen implicitly.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Indirect
  * *Evidence:* Lifecycle functions enforce strict status checks (`active` only) preventing implicit `finished` back to `active`.
* **REQ-WINNER-015** — Whether finalized sessions may be explicitly reopened, and if so who may authorize reopening and under what lifecycle/security rules, MUST be decided before implementation.
  * *Priority:* Post-MVP
  * *Status:* Decision Required
  * *Coverage:* None
  * *Evidence:* No reopening policy or command has been approved or implemented.

## UI/Product

* **REQ-UX-001** — The game screen MUST use a compact, score-focused layout.
  * *Priority:* MVP
  * *Status:* Partial
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` contains these modules, but is currently a developer-focused manual-refresh UI rather than a compact product layout.
* **REQ-UX-002** — The default UI language MUST be Spanish.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `App.tsx` uses hardcoded strings with no robust `i18n` usage.
* **REQ-UX-003** — An English language option MUST be available.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* No language switcher or translation catalog is present.
* **REQ-UX-004** — The default UI theme MUST be dark.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/styles` is not populated with dark mode defaults.
* **REQ-UX-005** — Each player MUST be able to choose a light theme individually without affecting another player's preferences.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* No theme-toggling UI or persistence layer currently implemented.

## Architecture/Security

* **REQ-SEC-001** — Firestore writes MUST remain deny-by-default where server-authoritative mutation is required.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-SEC-002** — Local development MUST use Firebase Emulator Suite and MUST NOT require production Firebase services.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`src/test/unit/firebase-emulators.test.ts`, `functions/test/firebase.test.ts`)
  * *Evidence:* `firebase.json`, `src/infrastructure/firebase/emulators.ts`, and `functions/src/firebase.ts` route local development to the `demo-cinque` emulators.
* **REQ-SEC-003** — Staging and production deployments MUST use separate Firebase projects and configurations before production release.
  * *Priority:* Pre-prod
  * *Status:* Deferred
  * *Coverage:* None
  * *Evidence:* `.firebaserc` currently maps only `demo-cinque`; separation is future intent in documentation, not an implemented deployment boundary.
* **REQ-SEC-004** — Sensitive mutations MUST use Callable Cloud Functions as the authoritative command layer.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`, `test:join-session`, `test:start-session`, `test:record-score`, `test:report-score`, `test:resolve-score-report`, `test:finalize-game`)
  * *Evidence:* `functions/src/*.ts`
* **REQ-SEC-005** — Operations MUST enforce least privilege server-side.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`, `test:create-session`, `test:join-session`, `test:start-session`, `test:record-score`, `test:report-score`, `test:resolve-score-report`, `test:finalize-game`)
  * *Evidence:* Internal Callable validations (`functions/src/*.ts`)
* **REQ-SEC-006** — Input parameters MUST be strictly validated.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`, `test:join-session`, `test:start-session`, `test:record-score`, `test:report-score`, `test:resolve-score-report`, `test:finalize-game`)
  * *Evidence:* Zod/custom validation present in Callables (`functions/src/*.ts`)
* **REQ-SEC-007** — App Check enforcement MUST be active.
  * *Priority:* Pre-prod
  * *Status:* Deferred
  * *Coverage:* None
  * *Evidence:* `docs/security.md` confirms it is pending for staging/prod deployment.

## MVP Gap Audit

The following functional MVP requirements remain Missing:

* Realtime synchronization for membership, lifecycle, scoring, winner, finalization, score-report, and score-correction updates (`REQ-SYNC-001` through `REQ-SYNC-007`).
* Shareable invitation links (`REQ-SESSION-006`).
* Spanish as the default UI language (`REQ-UX-002`).
* An English language option (`REQ-UX-003`).
* A dark default theme (`REQ-UX-004`).
* An individual light-theme preference (`REQ-UX-005`).
* Enforced 30-day retention for anonymous sessions (`REQ-SESSION-014`).
* Prior-session discovery or recovery for persistent users (`REQ-AUTH-004`). Firebase retaining session documents does not provide a discoverable history mechanism.

The production UI currently says: `La sesión finalizada debe reabrirse por el anfitrión antes de corregir puntuaciones.` This wording in `src/app/App.tsx` is premature and misleading because no reopening policy, authorized actor, or reopening command has been approved. The application file is intentionally unchanged by this documentation baseline.

## Technical Debt Outside MVP Behavior

This is a non-normative inventory tracked separately from functional product requirements:

* Large production bundle warning.
* Moderate dependency vulnerabilities in root `package.json`.
* Moderate dependency vulnerabilities in `functions/package.json`.
* Deprecated dependency warnings during `npm install`.
* Absence of GitHub Actions CI pipeline.

## Lean-Scope Audit (Scope Creep Check)

The repository was audited for premature abstractions that exceed the agreed Internet MVP:

* **Tile recognition:** Not present.
* **Digital board reconstruction:** Not present.
* **AI features:** Not present.
* **Advanced statistics:** Not present.
* **Complex profiles:** Not present.
* **Monetization:** Not present.
* **Matchmaking:** Not present.
* **Social features:** Not present.
* **Offline/LAN/Bluetooth:** Not present.
* **Excessive infrastructure:** Not present.

**Conclusion:** The codebase correctly adheres to the lean physical-game companion model without identified scope creep.
