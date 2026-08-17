# Security baseline

- `firestore.rules` is fail-closed (`allow read, write: if false`).
- No arbitrary client reads or writes are allowed by default.
- Rules tests cover denied unauthenticated reads, denied unauthenticated writes, and denied arbitrary writes even for authenticated users.
- Local work uses Firebase emulators with `demo-cinque`; no production credentials required.
- Secrets are not stored in repository files; `.env.example` contains only non-secret placeholders.
