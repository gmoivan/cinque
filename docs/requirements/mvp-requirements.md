# Cinque MVP Requirements

This document specifies the authoritative, verifiable requirements for the initial MVP Internet release of Cinque.

## Traceability Summary
| Domain | Implemented | Partial | Missing | Deferred | Decision Required |
|---|---|---|---|---|---|
| **Identity** | 5 | 0 | 0 | 0 | 0 |
| **Sessions** | 6 | 0 | 0 | 0 | 0 |
| **Scoring** | 8 | 0 | 0 | 0 | 0 |
| **Score Reports** | 13 | 0 | 0 | 0 | 0 |
| **Winner Lifecycle** | 9 | 0 | 1 | 0 | 1 |
| **UI/Product** | 1 | 0 | 3 | 0 | 0 |
| **Architecture** | 5 | 0 | 0 | 1 | 0 |

---

## Identity / Auth

* **REQ-AUTH-001** — Anonymous authentication MUST be the default entry method.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `src/infrastructure/firebase/authentication.ts` | `test:auth`
* **REQ-AUTH-002** — Google sign-in MUST be available as an option.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `src/infrastructure/firebase/authentication.ts` | `test:auth`
* **REQ-AUTH-003** — A player identity MUST be associated with their session membership.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/joinSession.ts` | `test:join-session`
* **REQ-AUTH-004** — Anonymous identity creation MUST be lazy (only created when needed).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `src/infrastructure/firebase/authentication.ts` | `src/test/unit/firebase-authentication.test.ts`
* **REQ-AUTH-005** — Credential collisions during Google linking MUST NOT merge, delete, or replace the anonymous identity silently.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `src/infrastructure/firebase/authentication.ts` | `src/test/unit/firebase-authentication.test.ts`

## Sessions

* **REQ-SESSION-001** — A player MUST be able to create a session with a target score (divisible by 5, 200–1000) and display name.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/createSession.ts` | `test:create-session`
* **REQ-SESSION-002** — A session MUST support invitation by a 6-character short code.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/createSession.ts` | `test:create-session`
* **REQ-SESSION-003** — A player MUST be able to join an active lobby using a valid short code, up to a maximum of 4 players total.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/joinSession.ts` | `test:join-session`
* **REQ-SESSION-004** — Existing members MUST be able to reconnect/resolve membership without consuming an additional slot.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/joinSession.ts` | `test:join-session`
* **REQ-SESSION-005** — Only the session host MUST be able to start the game (transition from `lobby` to `active`).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/startSession.ts` | `test:start-session`
* **REQ-SESSION-006** — A session MUST NOT be startable if there are fewer than 2 players.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/startSession.ts` | `test:start-session`

## Scoring

* **REQ-SCORE-001** — An active member MUST be able to record a positive score for themselves (multiple of 5).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts` | `test:record-score`
* **REQ-SCORE-002** — An authenticated session member MUST NOT be able to record a score for another player's identity.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts`, `firestore.rules` | `test:record-score`
* **REQ-SCORE-003** — Score entries MUST be immutable once recorded.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts`, `firestore.rules` | `test:rules`
* **REQ-SCORE-004** — Score recording MUST be idempotent by client command ID.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts` | `test:record-score`
* **REQ-SCORE-005** — Each accepted score command MUST have one server-assigned, immutable per-session sequence number.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts` | `test:record-score`
* **REQ-SCORE-006** — Direct client writes to score entries MUST be denied by default.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `firestore.rules` | `test:rules`
* **REQ-SCORE-007** — The scoring history MUST remain auditable with all entries and corrections preserved.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/resolveScoreReport.ts` | `test:resolve-score-report`
* **REQ-SCORE-008** — Score retries and concurrent submissions MUST serialize deterministically via the session read boundary.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts` | `test:record-score`

## Score Reports

* **REQ-REPORT-001** — A member MUST be able to report another member's score entry for correction.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/reportScore.ts` | `test:report-score`
* **REQ-REPORT-002** — A member MUST NOT be able to report their own score.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/reportScore.ts` | `test:report-score`
* **REQ-REPORT-003** — A report reason MUST be provided.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/reportScore.ts` | `test:report-score`
* **REQ-REPORT-004** — A proposed corrected value MUST be optional (but if provided, must be 0 or a multiple of 5).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/reportScore.ts` | `test:report-score`
* **REQ-REPORT-005** — A score MUST have only one open report at a time.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/reportScore.ts` | `test:report-score`
* **REQ-REPORT-006** — Only the owner of the reported score MUST be able to resolve it.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/resolveScoreReport.ts` | `test:resolve-score-report`
* **REQ-REPORT-007** — A score owner MUST be able to accept a report and provide a final corrected value.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/resolveScoreReport.ts` | `test:resolve-score-report`
* **REQ-REPORT-008** — A score owner MUST be able to reject a report, resulting in no mutation to the score.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/resolveScoreReport.ts` | `test:resolve-score-report`
* **REQ-REPORT-009** — Resolving a report MUST be an append-only event without modifying the original score entry.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/resolveScoreReport.ts` | `test:resolve-score-report`
* **REQ-REPORT-010** — The `openScoreReportCount` MUST equal the actual number of open reports and fail closed if inconsistent.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/finalizeGame.ts`, `functions/src/reportScore.ts` | `test:report-score`, `test:finalize-game`
* **REQ-REPORT-011** — Creating a report MUST increment the session's consistent count by 1.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/reportScore.ts` | `test:report-score`
* **REQ-REPORT-012** — Resolving a report MUST decrement the session's consistent count by 1 exactly once.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/resolveScoreReport.ts` | `test:resolve-score-report`
* **REQ-REPORT-013** — Transaction failures MUST NOT leave partial mutations when creating or resolving reports.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/reportScore.ts`, `functions/src/resolveScoreReport.ts` | `test:report-score`, `test:resolve-score-report`

## Winner Lifecycle

* **REQ-WINNER-001** — The session MUST record the winner when a score causes a player to reach or exceed the target.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts` | `test:record-score`
* **REQ-WINNER-002** — Reaching the target MUST NOT automatically finalize the session.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts` | `test:record-score`
* **REQ-WINNER-003** — Explicit finalization (`finalizeGame`) MUST be allowed only for the host.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/finalizeGame.ts` | `test:finalize-game`
* **REQ-WINNER-004** — Explicit finalization MUST require an existing detected winner.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/finalizeGame.ts` | `test:finalize-game`
* **REQ-WINNER-005** — Explicit finalization MUST transition the session state from `active` to `finished`.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/finalizeGame.ts` | `test:finalize-game`
* **REQ-WINNER-006** — Finalization MUST be blocked while any score report remains open.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/finalizeGame.ts` | `test:finalize-game`
* **REQ-WINNER-007** — Finalization MUST NOT automatically reject, resolve, or delete open reports.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/finalizeGame.ts` | `test:finalize-game`
* **REQ-WINNER-008** — Once a session is finished, new scoring MUST be blocked.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/recordScore.ts` | `test:record-score`
* **REQ-WINNER-009** — Rejection of a report after finalization MUST be allowed if semantics permit it.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/resolveScoreReport.ts` | `test:resolve-score-report`
* **REQ-WINNER-010** — The host MUST be able to explicitly reopen a finalized session.
  * *Priority:* MVP
  * *Status:* Missing
  * *Evidence:* Pending lifecycle task. Mentioned in `architecture.md`.
* **REQ-WINNER-011** — What happens if there's a tie/concurrent crossing with accepted corrections that result in multiple players over the target?
  * *Priority:* MVP
  * *Status:* Decision required
  * *Evidence:* Domain rules establish first chronological crossing, but corrections behavior in extreme cases may need explicit tie-resolution product policy.

## UI/Product

* **REQ-UX-001** — The game screen MUST remain compact and focused on player modules, totals, recent scoring, numeric entry, and necessary controls.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `src/app/App.tsx` | Implicit manual test
* **REQ-UX-002** — The default UI language MUST be Spanish.
  * *Priority:* MVP
  * *Status:* Missing
  * *Evidence:* `App.tsx` has mixed strings, no proper `i18n` usage (`src/i18n` empty).
* **REQ-UX-003** — An English language option MUST be available.
  * *Priority:* MVP
  * *Status:* Missing
  * *Evidence:* No language switcher or translation catalog.
* **REQ-UX-004** — The default UI theme MUST be dark.
  * *Priority:* MVP
  * *Status:* Missing
  * *Evidence:* `src/styles` is not yet populated with dark mode defaults.

## Architecture/Security

* **REQ-SEC-001** — Firestore writes MUST remain deny-by-default where server-authoritative mutation is required.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `firestore.rules` | `test:rules`
* **REQ-SEC-002** — Environment separation MUST be supported (Local emulator, staging, production).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `docs/decisions.md` | `firebase.json`
* **REQ-SEC-003** — Sensitive mutations MUST use Callable Cloud Functions as the authoritative command layer.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* `functions/src/*.ts`
* **REQ-SEC-004** — Operations MUST enforce least privilege server-side.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* All Callable endpoints enforce `isMember()` or ownership internally.
* **REQ-SEC-005** — Input parameters MUST be strictly validated.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Evidence:* Zod/custom validation present in Callables.
* **REQ-SEC-006** — App Check enforcement.
  * *Priority:* Post-MVP / Pre-prod
  * *Status:* Deferred
  * *Evidence:* `docs/security.md` confirms it is pending for staging/prod.
