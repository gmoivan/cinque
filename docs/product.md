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
- Host has limited authority.
- Each player may modify only their own scoring.
- Another player may report an incorrect score.
- The affected player must approve the correction.
- Retain final scores and applied corrections; no exhaustive event/report history.
- Reaching or exceeding the target detects a winner but does not immediately close the game.
- Points may continue being recorded until the host confirms closure.
- Winner is the first player who reached or exceeded the configured target.
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
