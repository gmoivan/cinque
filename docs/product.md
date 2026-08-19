# Product scope (MVP foundation)

Cinque accompanies physical Dominó Cinco games; it does not replace tiles or the table.

## Approved product decisions

- Maximum initial players: 4.
- All players begin at 0.
- Target is configured before starting.
- Priority MVP flow: create session → join → start → record own points → synchronize → reach target → detect winner → host confirms close.
- Anonymous Firebase Auth by default.
- Optional Google sign-in/account linking.
- Invitations use a shared link plus a short session code.
- Display names are unique within a session after trim, NFKC normalization, and lowercase comparison.
- Host has limited authority.
- The host starts a lobby at 2–4 players; there is no Ready state.
- Starting changes the session from `lobby` to `active`; new players cannot join afterward, while existing players can reconnect.
- Active members can record positive, five-point-multiple scores only for themselves. Each declared score is immutable and idempotent by client command ID.
- Each player may modify only their own scoring.
- Another player may report an incorrect score.
- The affected player must approve the correction.
- Retain final scores and applied corrections; no exhaustive event/report history.
- Reaching or exceeding the target detects a winner but does not immediately close the game.
- Points may continue being recorded until the host confirms closure.
- Winner is the player whose first authoritatively committed target-crossing score reaches or exceeds the configured target. Concurrent crossings resolve by Firestore transaction ordering, never by highest total or client time.
- First detection stores immutable server-authoritative `winnerUid`, `winnerDetectedAt`, `winningScoreCommandId`, and `winningTotalScore`; the session remains active and scoring continues until a later host-confirmed closure milestone.
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
