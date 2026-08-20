# Cinque

Internet MVP for the Cinque web app, a compact score companion for physical Dominó Cinco games.

## Stack

- React + Vite + TypeScript
- npm
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting (planned)
- Firebase Emulator Suite (local)

## Requirements

- Node.js 22 LTS (or another Vite 8 supported version)
- npm compatible with the supported Node.js runtime (npm 9.2.0 has been verified)

## Quick start

```bash
npm ci
npm --prefix functions ci
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
npm run test:unit
npm run test:rules
npm run test:realtime
npm run requirements:check
npm run build
```

## Player flow

1. Create a game with a name and target, or open a shared `?join=CODE` link.
2. Share the six-character code/link; the host starts when 2–4 players are present.
3. Each player records only their own five-point-multiple scores. All authorized devices update in realtime.
4. Any member can report another player's entry; its owner accepts a correction or rejects the report.
5. The host finalizes after a winner exists and no report is open. A finished game can be reopened only by the host with an auditable reason.

Spanish and dark mode are the defaults. Language and theme preferences are stored only in the current browser. Google-linked users see their recent sessions; anonymous sessions expire after the configured 30-day retention window unless a persistent member preserves them.

## Documentation

- `docs/product.md`
- `docs/architecture.md`
- `docs/security.md`
- `docs/decisions.md`
- `docs/plan.md`
- `docs/development.md`
- `docs/user-guide.md`
- `docs/requirements/mvp-requirements.md`
