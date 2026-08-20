# Cinque MVP Requirements

This document specifies the authoritative, verifiable requirements for the initial MVP Internet release of Cinque.

## Scope Boundaries

* **MVP Scope:** The initial MVP requires Internet connectivity. LAN, offline, Bluetooth, and Android-specific variants are strictly deferred to post-MVP.
* **Physical Game Boundary:** Cinque accompanies a physical Domino Five game. It MUST NOT reconstruct the digital board, simulate tiles, or perform tile recognition in the MVP.
* **Excluded Features:** AI, advanced statistics, monetization, matchmaking, and social features are strictly excluded from the MVP.

## Traceability Summary

| Domain | Total | Implemented | Partial | Missing | Deferred | Decision Required |
|---|---|---|---|---|---|---|
| **Identity / Auth** | 6 | 6 | 0 | 0 | 0 | 0 |
| **Sessions** | 12 | 10 | 0 | 2 | 0 | 0 |
| **Realtime Sync** | 4 | 0 | 0 | 4 | 0 | 0 |
| **Scoring** | 8 | 8 | 0 | 0 | 0 | 0 |
| **Score Reports** | 19 | 19 | 0 | 0 | 0 | 0 |
| **Winner Lifecycle** | 15 | 14 | 0 | 0 | 0 | 1 |
| **UI/Product** | 5 | 0 | 1 | 4 | 0 | 0 |
| **Architecture / Security** | 6 | 5 | 0 | 0 | 1 | 0 |
| **Totals** | **75** | **62** | **1** | **10** | **1** | **1** |

---

## Identity / Auth

* **REQ-AUTH-001** — Anonymous authentication MUST be the default entry method.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:auth`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`
* **REQ-AUTH-002** — Google sign-in MUST be available as an option.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:auth`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`
* **REQ-AUTH-003** — Google users MUST have persistent history.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Indirect
  * *Evidence:* Standard Firebase Google provider behavior without ephemeral accounts.
* **REQ-AUTH-004** — A player identity MUST be associated with their session membership.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-AUTH-005** — Anonymous identity creation MUST be lazy (only created when needed).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`src/test/unit/firebase-authentication.test.ts`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`
* **REQ-AUTH-006** — Credential collisions during Google linking MUST NOT merge, delete, or replace the anonymous identity silently.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`src/test/unit/firebase-authentication.test.ts`)
  * *Evidence:* `src/infrastructure/firebase/authentication.ts`

## Sessions

* **REQ-SESSION-001** — A player MUST be able to create a session with a target score (divisible by 5, 200–1000) and display name.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-002** — The session target score MUST be fixed before gameplay begins.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-003** — All players MUST begin with a zero accumulated score.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-004** — A session MUST support invitation by a 6-character short code.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:create-session`)
  * *Evidence:* `functions/src/createSession.ts`
* **REQ-SESSION-005** — A session MUST support invitation via a shareable join link.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` lacks URL routing/sharing logic for links.
* **REQ-SESSION-006** — Display names MUST be enforced as unique within a session using trim, NFKC normalization, and lowercase comparison.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-007** — A player MUST be able to join an active lobby using a valid short code, up to a maximum of 4 players total.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-008** — Existing members MUST be able to reconnect or resolve membership without consuming an additional seat.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-009** — New players MUST NOT be able to join after the lobby becomes active.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:join-session`)
  * *Evidence:* `functions/src/joinSession.ts`
* **REQ-SESSION-010** — Only the session host MUST be able to start the game (transition from `lobby` to `active`).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:start-session`)
  * *Evidence:* `functions/src/startSession.ts`
* **REQ-SESSION-011** — A session MUST NOT be startable if there are fewer than 2 players.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:start-session`)
  * *Evidence:* `functions/src/startSession.ts`
* **REQ-SESSION-012** — Anonymous sessions MUST have a 30-day retention requirement enforced.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* No automated TTL indices, cron jobs, or infrastructure mapped to this cleanup.

## Realtime Synchronization

* **REQ-SYNC-001** — Session membership and state updates MUST be visible in realtime to connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh; no active `onSnapshot` listeners.
* **REQ-SYNC-002** — Score updates MUST be visible in realtime to all connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.
* **REQ-SYNC-003** — Winner and finalization changes MUST be visible in realtime to all connected members.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.
* **REQ-SYNC-004** — Score report and correction state updates MUST be visible in realtime where authorized.
  * *Priority:* MVP
  * *Status:* Missing
  * *Coverage:* None
  * *Evidence:* `src/app/App.tsx` uses manual refresh.

## Scoring

* **REQ-SCORE-001** — An active member MUST be able to record a positive score for themselves (multiple of 5).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-002** — An authenticated session member MUST NOT be able to record a score for another player's identity.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-003** — Score entries MUST be immutable once recorded.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-SCORE-004** — Score recording MUST be idempotent by client command ID.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-005** — Each accepted score command MUST have one server-assigned, immutable per-session sequence number.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-006** — Score retries and concurrent submissions MUST serialize deterministically via the session read boundary.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:record-score`)
  * *Evidence:* `functions/src/recordScore.ts`
* **REQ-SCORE-007** — Direct client writes to score entries MUST be denied by default.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-SCORE-008** — The scoring history MUST remain auditable with all entries and corrections preserved.
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
* **REQ-REPORT-004** — A proposed corrected value MUST be optional, but if provided, must be 0 or a multiple of 5.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-005** — An already-open report MUST be surfaced rather than allowing a duplicate open report.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-006** — Only the owner of the reported score MUST be able to resolve it.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-007** — A resolution reason MUST be optional.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-008** — Report creation retries MUST be idempotent.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-009** — Resolution retries MUST be idempotent.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-010** — An accepted correction MUST produce a new append-only correction event without modifying the original score entry.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-011** — Rejection of a report MUST produce no score correction.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-012** — Direct unauthorized mutation of report or correction audit state MUST be denied.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:rules`)
  * *Evidence:* `firestore.rules`
* **REQ-REPORT-013** — New reports MUST be blocked once the session is finished.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-014** — Accepted corrections MUST be blocked once the session is finished.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-015** — Rejection of a report after finalization MUST remain allowed under current semantics.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-016** — Inconsistent `openScoreReportCount` MUST never be silently repaired or coerced.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:finalize-game`)
  * *Evidence:* `functions/src/finalizeGame.ts`
* **REQ-REPORT-017** — Creating a report MUST increment the session's consistent open report count by 1.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`)
  * *Evidence:* `functions/src/reportScore.ts`
* **REQ-REPORT-018** — Resolving a report MUST decrement the session's consistent open report count by 1 exactly once.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
* **REQ-REPORT-019** — Transaction failures MUST NOT leave partial mutations when creating or resolving reports.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:report-score`, `test:resolve-score-report`)
  * *Evidence:* `functions/src/reportScore.ts`, `functions/src/resolveScoreReport.ts`

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
* **REQ-WINNER-005** — Active accepted corrections MAY remove or replace winner metadata after history sequence replay.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (`test:resolve-score-report`)
  * *Evidence:* `functions/src/resolveScoreReport.ts`
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
* **REQ-WINNER-011** — Finalization MUST NOT automatically reject, resolve, or delete open reports.
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
* **REQ-WINNER-015** — The exact workflow and authorization semantics for a host to explicitly reopen a finalized session MUST be determined.
  * *Priority:* Post-MVP
  * *Status:* Decision Required
  * *Coverage:* None
  * *Evidence:* Future pending lifecycle task explicitly noted as undecided.

## UI/Product

* **REQ-UX-001** — The game screen MUST remain compact and focused on player modules, totals, recent scoring, numeric entry, and necessary controls.
  * *Priority:* MVP
  * *Status:* Partially implemented
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
* **REQ-SEC-002** — Environment separation MUST be supported (Local emulator, staging, production).
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (Emulator runs)
  * *Evidence:* `firebase.json`, `docs/decisions.md`
* **REQ-SEC-003** — Sensitive mutations MUST use Callable Cloud Functions as the authoritative command layer.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (All unit and integration tests)
  * *Evidence:* `functions/src/*.ts`
* **REQ-SEC-004** — Operations MUST enforce least privilege server-side.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (Negative integration tests)
  * *Evidence:* Internal Callable validations (`functions/src/*.ts`)
* **REQ-SEC-005** — Input parameters MUST be strictly validated.
  * *Priority:* MVP
  * *Status:* Implemented
  * *Coverage:* Direct (Input validation tests)
  * *Evidence:* Zod/custom validation present in Callables (`functions/src/*.ts`)
* **REQ-SEC-006** — App Check enforcement MUST be active.
  * *Priority:* Pre-prod
  * *Status:* Deferred
  * *Coverage:* None
  * *Evidence:* `docs/security.md` confirms it is pending for staging/prod deployment.
