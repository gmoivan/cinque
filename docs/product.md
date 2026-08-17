# Product scope (MVP foundation)

Cinque accompanies physical Dominó Cinco matches and does not replace physical tiles/table.

## Approved product decisions

- Maximum 4 players initially.
- All players start at 0.
- Configurable target before game start.
- Priority MVP flow: create session → join → start → record own points → synchronize → reach target → detect winner → host confirms close.
- Firebase Anonymous Auth by default.
- Optional Google sign-in/account linking.
- Invitation by shared link plus short session code.
- Host has limited authority.
- Each player may modify only their own scoring.
- Another player may report an incorrect score.
- The affected player must approve the correction.
- Retain final scoring and applied corrections, not an exhaustive event/report log.
- Reaching the target detects a winner but does not immediately close the game.
- Scoring may continue until the host confirms closure.
- Winner is the first player who reached or exceeded the configured target.
- Disconnected players retain their seat and may reconnect.
- Persistent history for Google users.
- Anonymous sessions have a 30-day retention requirement.
- MVP requires Internet.
- LAN/offline and Android are possible future extensions.
- Spanish is the default product language, with English support planned.
- Dark theme is default, with an individual light-theme preference.
