# Production readiness review

Review target: staging evidence for `chore/preproduction-staging` on 2026-08-20. Production deployment is explicitly out of scope.

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Functional MVP and realtime | Blocker | Real smoke reaches `createSession`, then the runtime service account is denied by Firestore; no functional cloud step can be approved yet |
| Google Authentication | Blocker | Anonymous and Google providers plus both Hosting domains are configured; real redirect/link/sign-out/recovery evidence still requires an interactive browser after the Firestore gate is fixed |
| Rules and Callable authorization | Ready with accepted risk | 8 Rules and 33 emulator integration tests pass; Cloud Run reaches the Callable runtime, but downstream cloud authorization negatives remain blocked |
| App Check | Blocker | reCAPTCHA Enterprise is registered and a valid debug token reaches Callable verification; the negative returns 401. Firestore/Auth product enforcement remains off until the positive smoke completes |
| Secrets and IAM | Blocker | Nine HTTP services have individual `allUsers` invoker bindings and the TTL trigger does not. The runtime service account still needs an explicitly approved Firestore data role |
| Environment isolation | Ready | Staging is explicit; production ID is absent and deploy fails closed |
| Hosting / Functions / Rules / indexes | Ready with accepted risk | Hosting returns 200 and all ten Node 22 Gen 2 Functions are active; end-to-end behavior is not yet approved |
| TTL | Blocker | `sessionExpirations.expiresAt` is ACTIVE, but direct trigger/recursive cleanup evidence is blocked by the same runtime Firestore permission |
| Observability | Ready with accepted risk | Cloud Logging distinguishes the former Cloud Run denial, successful Callable verification, and the current Firestore `PERMISSION_DENIED`; post-smoke review remains required |
| Costs | Ready | Staging-only MXN 25 alert at 50/90/100%; it is not a spend cap |
| Rollback | Ready with accepted risk | Product-specific runbook; Firebase has no atomic cross-product rollback |
| Dependencies | Ready with accepted risk | 0 frontend runtime; 7 moderate unreachable Storage-chain findings remain |
| CI / deployment | Ready with accepted risk | Validate passes on the staging branch and WIF trust is repo-and-branch restricted. GitHub cannot dispatch the deploy workflow while that workflow exists only outside the default branch; registering it would require the prohibited merge to `main` |

The blocking IAM change is `roles/datastore.user` on project `cinque-staging-gmoiv` for `serviceAccount:777083460844-compute@developer.gserviceaccount.com`. It is required by the Firestore transaction in `createSession`; the current `eventarc.eventReceiver`, `run.builder`, and `run.invoker` roles do not grant data access. A custom role limited to the required entity/transaction permissions is the lower-level alternative, but either option is an additional IAM grant and requires explicit approval.

## Production-readiness matrix

| Area | Status | Rationale |
|---|---|---|
| Functional | Blocker | Real create/join/score/report/finalize/reopen and realtime smoke cannot proceed past the first Firestore transaction |
| Security | Blocker | Layer separation is demonstrated through App Check, Auth, Cloud Run, and logs, but cloud authorization negatives and product enforcement are incomplete |
| Infrastructure | Blocker | Deployed resources are healthy, yet the Functions runtime cannot access its Firestore data plane |
| Operations | Blocker | TTL cleanup and interactive Google Auth remain incomplete; live WIF deploy is also blocked because GitHub has not registered the branch-only workflow on the default branch |
| Quality | Ready with accepted risk | 154 local tests, typecheck, lint, build, requirements validation, and dependency audit pass; the 780 kB main bundle and moderate unreachable audit findings remain accepted risks |

The overall state remains **Blocker** until every cloud evidence item is replaced with an exact result. Even a fully Ready review does not authorize production deploy or merge.
