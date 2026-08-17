# Development

## Install

```bash
npm install
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
npm run build
```

## Environment variables

Copy `.env.example` to `.env.local` and adjust if needed. For local emulator usage, keep:

- `VITE_FIREBASE_PROJECT_ID=demo-cinque`
- `VITE_USE_FIREBASE_EMULATORS=true`
