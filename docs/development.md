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
npm run build
```

## Environment variables

Copy `.env.example` to `.env.local` and adjust if needed. For local emulator usage, keep:

- `VITE_FIREBASE_PROJECT_ID=demo-cinque`
- `VITE_USE_FIREBASE_EMULATORS=true`

`npm run test:auth` runs the focused Cinque authentication-service integration test against the local Authentication Emulator. It uses `demo-cinque` only and never requires real Firebase credentials.

`npm run test:create-session` (also available as `npm run test:join-session`) builds the repository-local Node 22 Functions project and runs real Create/Join flows against the Auth, Firestore, and Functions emulators. The Emulator Suite includes its UI and uses `demo-cinque` only.

Google redirect tests use Firebase-adapter seams and never contact real Google OAuth. For staging or production readiness, enable Google independently in each Firebase project, configure authorized domains and the correct `VITE_FIREBASE_AUTH_DOMAIN`, and follow Firebase Hosting redirect guidance for custom domains or `web.app` deployments.
