# Production readiness review

Review target: staging evidence for `chore/preproduction-staging` on 2026-08-20. Production deployment is explicitly out of scope.

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Functional MVP and realtime | Ready | Real two-player staging smoke passes create/join/realtime/score/report/correction/winner/finalize/reopen and a second finalization |
| Google Authentication | Blocker | Anonymous and Google providers plus both Hosting domains are configured; real redirect/link/sign-out/recovery evidence still requires an interactive browser after the Firestore gate is fixed |
| Rules and Callable authorization | Ready | Cloud negatives verify non-host command rejection, server-managed writes, private history, private indexes, idempotency conflict, invalid reopening, and report resolution authorization |
| App Check | Ready with accepted risk | Valid Auth/App Check reaches and completes the Callable flow; missing and malformed App Check tokens return 401. Firestore/Auth product enforcement intentionally remains off pending a hosted-browser attestation decision |
| Secrets and IAM | Ready | Nine HTTP services have individual `allUsers` invoker bindings, cleanup remains private, and the runtime has conditional `datastore.user` access only to staging `(default)` |
| Environment isolation | Ready | Staging is explicit; production ID is absent and deploy fails closed |
| Hosting / Functions / Rules / indexes | Ready | Hosting returns 200 and all ten Node 22 Gen 2 Functions are active; the cloud smoke verifies the deployed Rules and Callable boundaries |
| TTL | Ready with accepted risk | `sessionExpirations.expiresAt` is ACTIVE and a controlled deletion triggered verified recursive cleanup. Managed TTL scheduling remains asynchronous and was not claimed as observed |
| Observability | Ready with accepted risk | Logs show expected Callable/Rules negatives and `ttl_cleanup_completed: deleted`; no unexpected error remains after IAM propagation |
| Costs | Ready | Staging-only MXN 25 alert at 50/90/100%; it is not a spend cap |
| Rollback | Ready with accepted risk | Product-specific runbook; Firebase has no atomic cross-product rollback |
| Dependencies | Ready with accepted risk | 0 frontend runtime; 7 moderate unreachable Storage-chain findings remain |
| CI / deployment | Ready with accepted risk | Validate passes on the staging branch and WIF trust is repo-and-branch restricted. GitHub cannot dispatch the deploy workflow while that workflow exists only outside the default branch; registering it would require the prohibited merge to `main` |

The runtime binding is `roles/datastore.user` on project `cinque-staging-gmoiv` for `serviceAccount:777083460844-compute@developer.gserviceaccount.com`, conditioned on `resource.name=="projects/cinque-staging-gmoiv/databases/(default)"`. The real smoke passed after Firestore IAM propagation; no access to another database or production was granted.

## Production-readiness matrix

| Area | Status | Rationale |
|---|---|---|
| Functional | Ready | Full real two-player flow, correction, winner lifecycle, realtime updates, and critical command negatives pass |
| Security | Ready with accepted risk | Cloud Run, Auth, App Check, Rules, Callable authorization, and conditional Firestore IAM are separated and tested; product Firestore App Check enforcement awaits a hosted-browser attestation decision |
| Infrastructure | Ready | Staging Hosting, Firestore, ten Functions, conditional runtime data access, TTL policy, and private cleanup trigger are live and tested |
| Operations | Blocker | Interactive Google OAuth evidence and a live WIF deployment remain incomplete; the latter cannot be dispatched while its workflow is absent from the default branch |
| Quality | Ready with accepted risk | 154 local tests, typecheck, lint, build, requirements validation, and dependency audit pass; the 780 kB main bundle and moderate unreachable audit findings remain accepted risks |

The overall state remains **Blocker** until every cloud evidence item is replaced with an exact result. Even a fully Ready review does not authorize production deploy or merge.
