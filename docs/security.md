# Security baseline

- `firestore.rules` is fail-closed (`allow read, write: if false`).
- No arbitrary client reads or writes are allowed by default.
- Rules tests cover denied unauthenticated reads, denied unauthenticated writes, and denied arbitrary writes even for authenticated users.
- Local work uses Firebase emulators with `demo-cinque`; no production credentials required.
- Secrets are not stored in repository files; `.env.example` contains only non-secret placeholders.
- Google Auth is not configured for staging or production in this milestone. Before either environment enables it, enable the provider in that Firebase project, configure its authorized domains, and set the matching `authDomain`.
- Redirect-based Auth behind Firebase Hosting/custom domains must follow Firebase redirect best practices so browser third-party-storage restrictions do not break the flow. Google tokens and profile data are not persisted by Cinque.
