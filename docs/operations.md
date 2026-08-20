# Staging operations

## Environment matrix

| Aspect | Local | Staging | Production |
|---|---|---|---|
| Firebase project | `demo-cinque` emulators | `cinque-staging-gmoiv` | Not configured; deployment disabled |
| Auth | Emulator | Real Anonymous + Google | Future dedicated project |
| Firestore | Emulator | Real database and Rules | Future dedicated project |
| Functions | Emulator | Real 2nd gen, Node 22 | Future dedicated project |
| App Check | Not initialized | reCAPTCHA Enterprise; enforced after verified smoke | Future; never enabled by this runbook |
| Hosting | Vite local server | `https://cinque-staging-gmoiv.web.app` | Future |
| TTL | Function/emulator tests | `sessionExpirations.expiresAt` policy | Future |

Firebase recommends a separate project for each environment. The repository has no default project alias: `.firebaserc` contains only `staging`, and every cloud deploy passes an explicit project ID. `config/environments.json` leaves production `null`; `npm run deploy:production` therefore fails closed. See the official [environment guidance](https://firebase.google.com/docs/projects/dev-workflows/overview-environments) and [CLI alias reference](https://firebase.google.com/docs/cli#project_aliases).

## Configuration classes

- Public frontend configuration: Firebase Web API key, auth domain, project ID, bucket, sender ID, app ID, and reCAPTCHA Enterprise site key in `.env.staging`. Firebase documents that Firebase API keys identify the project and are not authorization secrets; Rules and App Check protect data and APIs.
- Non-secret deployment configuration: project IDs, app ID, Hosting URL, function runtime, and App Check enforcement mode.
- Secrets: none are required by the application or Functions. Functions use managed identity. Google access tokens, OAuth credentials, service-account keys, and App Check debug tokens must never be committed.

Production-like builds fail when required values are missing, when staging uses another project, when production uses staging, or when a cloud build enables emulators. Local development is restricted to `demo-cinque`.

## Staging deploy

Prerequisites:

1. Node 22, Java 21, npm, Firebase CLI 15.27.0, and authenticated Google/Firebase access.
2. A clean non-`main` branch.
3. Billing enabled on `cinque-staging-gmoiv`.
4. Firestore created in the approved location, Authentication configured, and the registered staging Web App present.

Run:

```bash
npm run deploy:staging
npm run smoke:staging
```

The deploy script performs clean installs, the complete predeploy validation, and then exactly:

```bash
firebase deploy \
  --project cinque-staging-gmoiv \
  --only auth,firestore:rules,firestore:indexes,functions,hosting \
  --force
```

It never calls an unscoped `firebase deploy`. Firebase requires `--force` to acknowledge the retry policy on the idempotent TTL cleanup trigger; here it is constrained to the explicit staging project and resource allowlist and is unrelated to Git force-push. Deployment records must include the Git SHA, command output, Hosting URL, Function revisions, Rules release, and TTL policy state.

## App Check

The staging Web App uses reCAPTCHA Enterprise with a score-based key restricted to the staging `web.app` and `firebaseapp.com` domains. The client initializes App Check before Authentication. Every callable uses `enforceAppCheck` for real projects; only `demo-cinque` emulator calls are exempt. Authentication and Firestore enforcement are enabled only after a valid-token smoke passes. Replay-token consumption is intentionally off because it adds a verification round trip and quota load; Authentication, Rules, and server authorization remain authoritative.

`npm run smoke:staging` registers a random debug token only for the automated staging test, keeps it in process memory, and deletes it in `finally`. Debug tokens are never used by the hosted app or committed. Firebase recommends monitoring verified/invalid request metrics before enforcing an existing app; Cinque staging has no legacy clients, so enforcement follows the first verified smoke. See [web App Check](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [request metrics](https://firebase.google.com/docs/app-check/monitor-metrics), and [Callable enforcement](https://firebase.google.com/docs/app-check/cloud-functions).

## TTL and retention

`firestore.indexes.json` enables TTL on `sessionExpirations.expiresAt`. TTL deletion is asynchronous (typically within 24 hours), is not ordered, and does not cascade to subcollections. The delete trigger therefore re-reads trusted session state, restores an early marker, preserves persistent sessions, recursively deletes an eligible anonymous session, and tolerates retry after deletion. Function tests exercise restored, preserved, deleted, malformed, and already-removed states.

After deployment, verify the policy with:

```bash
gcloud firestore fields ttls list --project=cinque-staging-gmoiv --database='(default)'
```

A controlled expired marker may be used only in staging. Verify the trigger and recursive cleanup separately; do not claim the managed TTL scheduler is instantaneous. See the official [TTL guide](https://firebase.google.com/docs/firestore/ttl) and [index definition](https://firebase.google.com/docs/reference/firestore/indexes).

## Observability

Callables emit structured `callable_failed` events containing only function name, sanitized code, and Auth/App Check presence. TTL handling emits `ttl_cleanup_completed` with outcome or `ttl_cleanup_failed` with the platform error. No input payload, token, display name, code, or UID is logged.

Useful staging queries:

```bash
gcloud functions logs read --project=cinque-staging-gmoiv --region=us-central1 --limit=100
gcloud logging read \
  'resource.type="cloud_run_revision" AND jsonPayload.event="ttl_cleanup_failed"' \
  --project=cinque-staging-gmoiv --limit=50
```

Cloud Logging and standard Error Reporting are sufficient for this MVP; no external provider is installed.

## Costs and abuse controls

Primary cost drivers are Firestore listeners/reads, command and audit writes, Functions invocations/builds, Hosting transfer, Authentication usage, reCAPTCHA Enterprise assessments, and TTL deletes (which are billed deletes). Current controls are member-scoped Rules, authoritative Callables, strict input limits, 2–4 player sessions, App Check, no minimum Function instances, and bounded realtime listeners.

Budget `d9511362-9241-4811-9cb7-fac4231e09da` scopes only project number `777083460844`: MXN 25 per month with current-spend alerts at 50%, 90%, and 100%. A budget is an alert, not a hard cap. No quota was reduced because an untested hard limit could break the MVP. Review Firebase/GCP usage dashboards after every smoke and before production.

## Rollback

Firebase does not provide one transactional rollback across all products.

- Hosting: select the prior live-channel release in Firebase Hosting and use **Roll back**; record its version and release ID.
- Functions: check out the previously deployed Git SHA, install from lockfiles, build, and redeploy only `functions` to the explicit staging project. Confirm data-schema compatibility first.
- Firestore Rules: restore the prior `firestore.rules` from the deployed Git SHA and redeploy `firestore:rules`. The console cannot roll Rules back automatically.
- Indexes/TTL: restore and redeploy the prior index file only after impact review. Index creation/deletion and TTL changes are asynchronous; removing a TTL policy does not restore deleted data.
- Application/config: identify every deployment by Git SHA and Hosting release. Never roll back staging by deploying an uncommitted tree.

Production has no configured project ID or deployment workflow and is not part of any rollback procedure yet.
