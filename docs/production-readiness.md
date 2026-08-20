# Production readiness review

Review target: staging evidence for `main` at SHA `7e1af797a8e5156a5646863c1d593b0a50e25739` on 2026-08-20. Production deployment is explicitly out of scope.

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Functional MVP and realtime | Ready | Real two-player staging smoke passes create/join/realtime/score/report/correction/winner/finalize/reopen and a second finalization |
| Google Authentication | NOT EXECUTABLE | Anonymous and Google providers plus both Hosting domains are configured; automated browser testing of real redirect/link/sign-out/recovery is blocked by Google OAuth anti-automation mechanisms. Requires manual execution. |
| Rules and Callable authorization | Ready | Cloud negatives verify non-host command rejection, server-managed writes, private history, private indexes, idempotency conflict, invalid reopening, and report resolution authorization |
| App Check | Ready with accepted risk | Valid Auth/App Check reaches and completes the Callable flow; missing and malformed App Check tokens return 401. Firestore/Auth product enforcement intentionally remains off pending manual hosted-browser attestation. |
| Secrets and IAM | Ready with accepted risk | Nine HTTP services have individual `allUsers` invoker bindings, cleanup remains private, and the runtime has conditional `datastore.user` access only to staging `(default)`. Deployer Service Account retains `firebase.admin` and `serviceusage.serviceUsageAdmin` as temporary/accepted staging risks pending narrower deploy role discovery and refactor. (Experimento 1 demostró que retirar `serviceUsageAdmin` rompió los deploys actuales desde `main` porque Auth provisiona APIs; el rol fue restaurado temporalmente devolviendo el deploy a estado funcional exitoso). Separating bootstrap from routine deployment is implemented, pending the next post-merge IAM reduction experiment. |
| Environment isolation | Ready | Staging is explicit; production ID is absent and deploy fails closed |
| Hosting / Functions / Rules / indexes | Ready | Hosting returns 200 and all ten Node 22 Gen 2 Functions are active; the cloud smoke verifies the deployed Rules and Callable boundaries |
| TTL | Ready with accepted risk | `sessionExpirations.expiresAt` is ACTIVE and a controlled deletion triggered verified recursive cleanup. Managed TTL scheduling remains asynchronous and was not claimed as observed |
| Observability | Ready with accepted risk | Logs show expected Callable/Rules negatives and `ttl_cleanup_completed: deleted`; no unexpected error remains after IAM propagation |
| Costs | Ready | Staging-only MXN 25 alert at 50/90/100%; it is not a spend cap |
| Rollback | Ready with accepted risk | Product-specific runbook; Firebase has no atomic cross-product rollback |
| Dependencies | Ready with accepted risk | 0 frontend runtime; 7 moderate unreachable Storage-chain findings remain |
| CI / deployment | Ready | PR #12 is merged. WIF trust is repo-and-branch restricted to `gmoivan/cinque` and `refs/heads/main`. Deploy workflow runs successfully from `main`. |

The runtime binding is `roles/datastore.user` on project `cinque-staging-gmoiv` for `serviceAccount:777083460844-compute@developer.gserviceaccount.com`, conditioned on `resource.name=="projects/cinque-staging-gmoiv/databases/(default)"`. The real smoke passed after Firestore IAM propagation; no access to another database or production was granted.

## Production-readiness matrix

| Area | Status | Rationale |
|---|---|---|
| Functional | Ready | Full real two-player flow, correction, winner lifecycle, realtime updates, and critical command negatives pass |
| Security | Ready with accepted risk | Cloud Run, Auth, App Check, Rules, Callable authorization, and conditional Firestore IAM are separated and tested; product Firestore App Check enforcement awaits a hosted-browser attestation decision |
| Infrastructure | Ready | Staging Hosting, Firestore, ten Functions, conditional runtime data access, TTL policy, and private cleanup trigger are live and tested |
| Operations | Blocker | Interactive Google OAuth evidence and manual App Check browser verification remain incomplete (NOT EXECUTABLE via automation). |
| Quality | Ready with accepted risk | 154 local tests, typecheck, lint, build, requirements validation, and dependency audit pass; the 780 kB main bundle and moderate unreachable audit findings remain accepted risks |

The overall state remains **Blocker** until every cloud evidence item is replaced with an exact result. Even a fully Ready review does not authorize production deploy or merge.
