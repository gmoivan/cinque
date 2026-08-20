# Production readiness review

Review target: staging evidence for `chore/preproduction-staging`. Production deployment is explicitly out of scope.

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Functional MVP and realtime | Blocker | Requires completed real staging smoke |
| Google Authentication | Blocker | Provider configuration and real redirect/link/sign-out/recovery evidence required |
| Rules and Callable authorization | Ready with accepted risk | Emulator suite is comprehensive; cloud rejection smoke still required |
| App Check | Blocker | Hosted client and enforced Firestore/Auth/Callables must pass |
| Secrets and IAM | Ready with accepted risk | No tracked private secret; GitHub WIF bindings still require live verification |
| Environment isolation | Ready | Staging is explicit; production ID is absent and deploy fails closed |
| Hosting / Functions / Rules / indexes | Blocker | Deployment evidence required |
| TTL | Blocker | Cloud policy and trigger evidence required |
| Observability | Ready with accepted risk | Structured source logging exists; verify Cloud Logging after deploy |
| Costs | Ready | Staging-only MXN 25 alert at 50/90/100%; it is not a spend cap |
| Rollback | Ready with accepted risk | Product-specific runbook; Firebase has no atomic cross-product rollback |
| Dependencies | Ready with accepted risk | 0 frontend runtime; 7 moderate unreachable Storage-chain findings remain |
| CI / deployment | Ready with accepted risk | PR validation and manual staging workflow exist; live WIF run required |

The overall state remains **Blocker** until every cloud evidence item is replaced with an exact result. Even a fully Ready review does not authorize production deploy or merge.
