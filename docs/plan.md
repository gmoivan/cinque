# Initial plan

0. Foundation
1. Identity/authentication
   - Identity/Auth 1A complete: persisted auth-state restoration, fail-closed local-persistence errors, and lazy anonymous identities.
   - Identity/Auth 1B complete: Google redirect sign-in/linking, UID-preservation verification, and explicit no-merge collision handling.
2. Create session
   - Complete locally: authoritative Callable creation, host membership, private short-code lookup, initial capacity/name-key fields, and minimal development UI.
3. Join session
   - Complete locally: authenticated Callable lookup, atomic membership/capacity/name enforcement, reconnect-safe existing-member resolution, and minimal development UI.
4. Start session
   - Complete locally: host-authoritative `lobby` to `active` Callable transition for 2–4 players, trusted start timestamp, retry-safe host response, and Join/Start transaction serialization.
5. Register own points
   - Complete locally: authoritative, idempotent own-score recording and immutable per-player score history.
6. Real-time synchronization
7. Game finalization
   - Complete locally: first target-crossing transaction atomically establishes winner metadata while retaining `active`; ordinary scoring preserves that winner, and active score-report replay may remove or replace it. `finalizeGame` lets only the host transition an active complete winner with no open reports to `finished`; reopen remains a pending lifecycle task.
8. Host-confirmed closure
9. Corrections/reporting
   - Complete locally: members may report another player's score; only its owner may accept with a corrected value or reject. Immutable resolution/correction history, command retry safety, effective-total replay, winner reconsideration, and minimal member UI are included.
10. Security hardening, staging, and production readiness
