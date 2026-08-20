# Runtime dependency audit

Audit date: 2026-08-20. Advisory: [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

## Result

| Surface | Before | After | Assessment |
|---|---:|---:|---|
| Frontend runtime (`npm audit --omit=dev`) | 0 | 0 | No known runtime findings |
| Root tooling | 5 moderate | 5 moderate | Development-only Firebase CLI transitives |
| Functions runtime | 9 moderate | 7 moderate | Accepted upstream Storage chain risk; no high/critical findings |

`firebase-admin` was upgraded from installed 13.10.0 to 14.3.0. `firebase-functions` 7.3.2 explicitly supports Admin 14, and both require/support Node 22. This removed the vulnerable Firestore/`google-gax` path. Unit, integration, typecheck, lint, and build evidence pass. The real staging smoke remains blocked by runtime Firestore IAM, independently of these dependency findings.

## Remaining Functions findings

| Package | Direct | Installed path | Practical reachability and mitigation |
|---|---|---|---|
| `firebase-admin` 14.3.0 | Yes | Direct | Reported because it still depends on Storage 7.x. Cinque imports only Admin Firestore/app initialization, never Storage. |
| `firebase-functions` 7.3.2 | Yes | Direct | Inherits the Admin advisory; no independent vulnerable handler is used. |
| `@google-cloud/storage` 7.22.0 | No | Admin transitive | Storage is not initialized or called by Cinque. Admin currently pins the 7.x major. |
| `retry-request` 7.0.2 | No | Storage transitive | Unreachable through Cinque's Firestore-only runtime. |
| `teeny-request` 9.0.0 | No | Storage transitive | Unreachable through Cinque's Firestore-only runtime. |
| `gaxios` 6.7.1 | No | Storage auth transitive | Cinque supplies no attacker-controlled UUID buffer. |
| `uuid` 9.0.1 | No | Storage/gaxios transitive | Advisory affects v3/v5/v6 calls with a caller-provided undersized buffer; Cinque calls no UUID API. |

`npm audit` proposes destructive major downgrades (`firebase-admin` 10.3.0 / `firebase-functions` 4.9.0), not a safe fix. Overrides forcing Storage 8 would exceed Admin's declared dependency range. Temporary acceptance is therefore lower risk than an unsupported override or downgrade. Revisit when Firebase Admin adopts patched Storage transitives or npm publishes a compatible remediation; block production if severity becomes high/critical or a reachable Firestore/Auth path is identified.
