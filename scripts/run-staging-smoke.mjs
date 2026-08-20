import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectId = 'cinque-staging-gmoiv'
const appId = '1:777083460844:web:4828eb6167bc4d1779d9c9'
const firebase = join(process.cwd(), 'node_modules', '.bin', 'firebase')
const debugToken = randomUUID()
const displayName = `ephemeral-staging-smoke-${Date.now()}`
const baseEnvironment = {
  ...process.env,
  GOOGLE_CLOUD_QUOTA_PROJECT: projectId,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || join(tmpdir(), 'cinque-firebase-config'),
}
function firebaseJson(args) {
  const result = spawnSync(firebase, [...args, '--project', projectId, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: baseEnvironment,
  })
  if (result.status !== 0) throw new Error(`Firebase command failed: ${args[0]}.`)
  return JSON.parse(result.stdout)
}

function findDebugTokenId() {
  const listed = firebaseJson(['appcheck:debugtokens:list', '--app', appId])
  const token = listed.result?.find((candidate) => candidate.displayName === displayName)
  return token?.name?.split('/').at(-1)
}

let debugTokenId
try {
  const created = spawnSync(
    firebase,
    [
      'appcheck:debugtokens:create',
      debugToken,
      '--app', appId,
      '--display-name', displayName,
      '--project', projectId,
      '--force',
    ],
    { cwd: process.cwd(), env: baseEnvironment, stdio: 'ignore' },
  )
  if (created.status !== 0) throw new Error('Firebase command failed: appcheck:debugtokens:create.')
  debugTokenId = findDebugTokenId()
  if (!debugTokenId) throw new Error('Firebase did not return the ephemeral App Check debug token ID.')

  const smoke = spawnSync(
    join(process.cwd(), 'node_modules', '.bin', 'vitest'),
    ['run', 'src/test/staging/staging.smoke.test.ts'],
    {
      cwd: process.cwd(),
      env: { ...baseEnvironment, CINQUE_APP_CHECK_DEBUG_TOKEN: debugToken },
      stdio: 'inherit',
    },
  )
  if (smoke.status !== 0) throw new Error('Staging smoke test failed.')
} finally {
  if (!debugTokenId) {
    try {
      debugTokenId = findDebugTokenId()
    } catch {
      // The warning below records that automated cleanup could not be confirmed.
    }
  }
  if (debugTokenId) {
    const deleted = spawnSync(
      firebase,
      ['appcheck:debugtokens:delete', debugTokenId, '--app', appId, '--project', projectId, '--force'],
      { cwd: process.cwd(), env: baseEnvironment, stdio: 'ignore' },
    )
    if (deleted.status !== 0) process.stderr.write('Warning: could not delete the ephemeral App Check debug token.\n')
  }
}
