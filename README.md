# Cinque

Foundation for the Cinque web app (Dominó Cinco companion MVP).

## Stack

- React + Vite + TypeScript
- npm
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting (planned)
- Firebase Emulator Suite (local)

## Requirements

- Node.js 22 LTS (or another Vite 8 supported version)
- npm 10+

## Quick start

```bash
npm install
npm run dev
```

## Local Firebase emulators

Project ID: `demo-cinque`

```bash
npm run emulators
```

Enabled emulators:

- Authentication (`127.0.0.1:9099`)
- Firestore (`127.0.0.1:8080`)
- Emulator UI (`127.0.0.1:4000`)

## Validation commands

```bash
npm run lint
npm run test
npm run test:rules
npm run build
```

## Documentation

- `docs/product.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/decisions.md`
- `docs/plan.md`
- `docs/development.md`
