# Security baseline

- Firestore stays fail-closed by default. A session member may read its own session and player documents; clients cannot directly write sessions, memberships, or invitation-code documents. `sessionCodes` is never readable or writable by clients.
- `createSession` is Callable-authoritative. The server derives the host UID from Firebase Auth, validates display names and target scores, creates only the `lobby` state with four maximum players, and uses trusted timestamps. Admin SDK access bypasses rules, so these validations are required in the Function.
- The six-character invitation code is discovery only, never authorization. Code uniqueness is allocated transactionally with bounded retries and cryptographic randomness.
- No arbitrary client reads or writes are allowed by default.
- Rules tests cover denied unauthenticated reads, denied unauthenticated writes, and denied arbitrary writes even for authenticated users.
- Local work uses Firebase emulators with `demo-cinque`; no production credentials required.
- Secrets are not stored in repository files; `.env.example` contains only non-secret placeholders.
- Google Auth is not configured for staging or production in this milestone. Before either environment enables it, enable the provider in that Firebase project, configure its authorized domains, and set the matching `authDomain`.
- Redirect-based Auth behind Firebase Hosting/custom domains must follow Firebase redirect best practices so browser third-party-storage restrictions do not break the flow. Google tokens and profile data are not persisted by Cinque.
- App Check is not enforced locally. It must be enabled and enforced for staging/production callable endpoints before release.
