# Development

## Install

```bash
npm ci
npm --prefix functions ci
```

## Run app

```bash
npm run dev
```

## Run emulators

```bash
npm run emulators
```

## Quality checks

```bash
npm run lint
npm run test
npm run test:rules
npm run test:auth
npm run test:create-session
npm run test:join-session
npm run test:start-session
npm run test:record-score
npm run test:report-score
npm run test:finalize-game
npm run test:reopen-game
npm run test:realtime
npm run requirements:check
npm run build
```

`npm run validate:predeploy` runs frontend and Functions typecheck/lint/tests, Rules and all integration suites, requirements validation, and a staging-mode build. `npm run deploy:staging` additionally requires a clean non-`main` tree and always deploys to the explicit staging project. See `docs/operations.md`.

## Environment variables

Copy `.env.example` to `.env.local` and adjust if needed. For local emulator usage, keep:

- `VITE_FIREBASE_ENVIRONMENT=local`
- `VITE_FIREBASE_PROJECT_ID=demo-cinque`
- `VITE_USE_FIREBASE_EMULATORS=true`

`.env.staging` contains only the public Firebase Web/App Check identifiers for the dedicated staging project. No production environment file exists.

`npm run test:auth` runs the focused Cinque authentication-service integration test against the local Authentication Emulator. It uses `demo-cinque` only and never requires real Firebase credentials.

`npm run test:create-session` (also available as `npm run test:join-session`) builds the repository-local Node 22 Functions project and runs real Create/Join/history/retention flows against the Auth, Firestore, and Functions emulators. The focused lifecycle, score, report, finalization, and reopening scripts exercise their authoritative commands. `npm run test:realtime` drives the complete two-player flow through the browser Firebase SDK and emulator Callables while observing snapshots. `npm run requirements:check` parses all 94 requirement records and fails if the checked-in traceability counts drift. The Emulator Suite uses `demo-cinque` only.

## Retention deployment prerequisite

`firestore.indexes.json` declares TTL for `sessionExpirations.expiresAt`; deploy that configuration and Functions together in each approved target project. Firebase TTL deletion is asynchronous (typically within 24 hours after expiry), can trigger Functions, and does not delete subcollections, which is why `cleanupExpiredSession` performs verified recursive cleanup. See the official [TTL guide](https://firebase.google.com/docs/firestore/ttl) and [index configuration reference](https://firebase.google.com/docs/reference/firestore/indexes). No deployment is performed by repository tests.

Google redirect tests use Firebase-adapter seams and never contact real Google OAuth. For staging or production readiness, enable Google independently in each Firebase project, configure authorized domains and the correct `VITE_FIREBASE_AUTH_DOMAIN`, and follow Firebase Hosting redirect guidance for custom domains or `web.app` deployments.
