# Product scope (MVP foundation)

Cinque accompanies physical Dominó Cinco games; it does not replace tiles or the table.

## Approved product decisions

- Maximum initial players: 4.
- All players begin at 0.
- Target is configured before starting.
- Priority MVP flow: create session → join → start → record own points → synchronize → reach target → finish.
- Anonymous Firebase Auth by default.
- Optional Google sign-in/account linking.
- Invitations use a shared link plus a short session code.
- Display names are unique within a session after trim, NFKC normalization, and lowercase comparison.
- Host has limited authority.
- The host starts a lobby at 2–4 players; there is no Ready state.
- Starting changes the session from `lobby` to `active`; new players cannot join afterward, while existing players can reconnect.
- Active members can record positive, five-point-multiple scores only for themselves. Each declared score is immutable and idempotent by client command ID.
- Each player may modify only their own scoring.
- Winner detection and game finalization are separate lifecycle events. Reaching or exceeding the target records the first authoritative winner crossing, but the session remains active. Normal scoring may continue without replacing that winner. While active, accepted corrections replay effective history and may remove or replace the detected winner. `finalizeGame` is an explicit host-authorized action allowed only for an active session with a complete detected winner; it transitions to `finished` without changing the winner. Once finalized, scoring and result-changing corrections require explicit authorized reopening first.
- A game cannot be finalized while any score report remains open. The host must wait until every dispute is accepted or rejected; finalization never resolves or dismisses reports automatically.
- Every accepted score command has one server-assigned, immutable per-session sequence number. This is the authoritative total order for score history, deterministic winner detection, and future correction replay; client timestamps and command IDs do not establish chronology.
- Winner is the player whose first authoritatively sequenced target-crossing score reaches or exceeds the configured target. Concurrent crossings resolve by that server-assigned order, never by highest total or client time.
- First detection stores server-authoritative `winnerUid`, `winnerDetectedAt`, `winningScoreCommandId`, and `winningTotalScore` while retaining `active` status. Later ordinary scores remain allowed but do not replace those fields; active accepted corrections may recompute them from authoritative history. The host must call `finalizeGame` to transition to `finished`.
- A member may report another member's immutable score with a required reason and optional proposed value (zero or a multiple of five). One open report exists per score entry. Only the score owner may accept with their final corrected value or reject; both outcomes remain auditable, accepted corrections are append-only, and a later report may be created after resolution.
- Disconnected players retain their seat and may reconnect.
- Google users have persistent history.
- Anonymous sessions have a 30-day retention requirement.
- MVP requires Internet.
- LAN/offline and Android are possible future extensions.
- Spanish default, English optional.
- Dark theme default with individual light-theme preference.
- Local, staging, and production environments are separate.
- Local uses Firebase Emulator Suite.
- Staging and production will use separate Firebase projects.
- Firebase Hosting is planned.
- Prioritize free tier and low operating costs.
