import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const target = process.argv[2]
if (target !== 'staging' && target !== 'production') {
  throw new Error('Deployment target must be staging or production.')
}

const environments = JSON.parse(readFileSync(new URL('../config/environments.json', import.meta.url), 'utf8'))
const projectId = environments[target]?.projectId
if (!projectId) throw new Error(`${target} deployment is disabled until an explicit Firebase project ID is configured.`)
if (projectId === environments.local.projectId) throw new Error('Cloud deployment cannot target the emulator project.')
if (target === 'production' && projectId === environments.staging.projectId) {
  throw new Error('Production and staging Firebase project IDs must be different.')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || join(tmpdir(), 'cinque-firebase-config'),
    },
    stdio: 'inherit',
    ...options,
  })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed.`)
}

const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim()
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim()
if (branch === 'main') throw new Error('Deployment from main is disabled.')
if (status) throw new Error('Deployment requires a clean working tree so the deployed commit is auditable.')

run('npm', ['ci'])
run('npm', ['--prefix', 'functions', 'ci'])
run('npm', ['run', 'validate:predeploy'])
run(join(process.cwd(), 'node_modules', '.bin', 'firebase'), [
  'deploy',
  '--project', projectId,
  '--only', 'auth,firestore:rules,firestore:indexes,functions,hosting',
  '--force',
  '--message', `Cinque ${target} ${branch}`,
])
