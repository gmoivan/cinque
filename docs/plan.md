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
6. Real-time synchronization
7. Winner detection
8. Host-confirmed closure
9. Corrections/reporting
10. Security hardening, staging, and production readiness
