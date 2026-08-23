import cp from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'node:url'

export function runDeployment(args) {
  const target = args[2]
  const modeFlag = args[3]
  const mode = modeFlag === '--bootstrap-auth' ? 'bootstrap-auth' : 'routine'

  if (target !== 'staging' && target !== 'production') {
    throw new Error('Deployment target must be staging or production.')
  }
  if (args.length > 3 && modeFlag !== '--bootstrap-auth') {
    throw new Error('Invalid deployment mode. Supported: --bootstrap-auth')
  }

  const isBootstrapAuth = mode === 'bootstrap-auth'
  const deployTargets = isBootstrapAuth
    ? 'auth'
    : 'firestore:rules,firestore:indexes,functions,hosting'

  const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
  const environmentsPath = path.join(__dirname, '..', 'config', 'environments.json')
  const environments = JSON.parse(fs.readFileSync(environmentsPath, 'utf8'))
  const projectId = environments[target]?.projectId
  if (!projectId) throw new Error(`${target} deployment is disabled until an explicit Firebase project ID is configured.`)
  if (projectId === environments.local.projectId) throw new Error('Cloud deployment cannot target the emulator project.')
  if (target === 'production' && projectId === environments.staging.projectId) {
    throw new Error('Production and staging Firebase project IDs must be different.')
  }

  function run(command, cmdArgs, options = {}) {
    const result = cp.spawnSync(command, cmdArgs, {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || path.join(os.tmpdir(), 'cinque-firebase-config'),
      },
      stdio: 'inherit',
      ...options,
    })
    if (result.status !== 0) throw new Error(`${command} ${cmdArgs.join(' ')} failed.`)
  }

  const branch = cp.spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim()
  const status = cp.spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim()
  if (target === 'staging' && branch !== 'main') throw new Error('Staging deployment is restricted to main.')
  if (status) throw new Error('Deployment requires a clean working tree so the deployed commit is auditable.')

  run('npm', ['ci'])
  if (!isBootstrapAuth) {
    run('npm', ['--prefix', 'functions', 'ci'])
    run('npm', ['run', 'validate:predeploy'])
    run('npm', ['run', `build:${target}`])
  }

  run(path.join(process.cwd(), 'node_modules', '.bin', 'firebase'), [
    'deploy',
    '--project', projectId,
    '--only', deployTargets,
    '--force',
    '--message', `Cinque ${target} ${branch}${isBootstrapAuth ? ' (auth bootstrap)' : ''}`,
  ])
}

if (process.argv[1] === url.fileURLToPath(import.meta.url)) {
  runDeployment(process.argv)
}
