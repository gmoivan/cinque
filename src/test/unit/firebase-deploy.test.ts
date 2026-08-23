import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-ignore
import { runDeployment } from '../../../scripts/firebase-deploy.mjs'
import cp from 'node:child_process'
import fs from 'node:fs'

describe('firebase-deploy.mjs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      staging: { projectId: 'cinque-staging-gmoiv' },
      production: { projectId: null },
      local: { projectId: 'demo-cinque' }
    }))
    
    vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.includes('branch')) return { status: 0, stdout: 'main\n' } as any
      if (cmd === 'git' && args?.includes('status')) return { status: 0, stdout: '' } as any
      return { status: 0, stdout: '' } as any
    })
  })

  it('routine staging deploy does NOT include auth', () => {
    runDeployment(['node', 'script.mjs', 'staging'])
    const firebaseCall = vi.mocked(cp.spawnSync).mock.calls.find(c => c[0].endsWith('firebase'))
    expect(firebaseCall).toBeDefined()
    const callArgs = firebaseCall![1] as string[]
    expect(callArgs).toContain('--only')
    const onlyArgIndex = callArgs.indexOf('--only')
    const targets = callArgs[onlyArgIndex + 1]
    expect(targets).not.toContain('auth')
    expect(targets).toBe('firestore:rules,firestore:indexes,functions,hosting')
  })

  it('bootstrap auth path deploys only auth', () => {
    runDeployment(['node', 'script.mjs', 'staging', '--bootstrap-auth'])
    const firebaseCall = vi.mocked(cp.spawnSync).mock.calls.find(c => c[0].endsWith('firebase'))
    expect(firebaseCall).toBeDefined()
    const callArgs = firebaseCall![1] as string[]
    expect(callArgs).toContain('--only')
    const onlyArgIndex = callArgs.indexOf('--only')
    const targets = callArgs[onlyArgIndex + 1]
    expect(targets).toBe('auth')
  })

  it('bootstrap installs root dependencies but skips functions and validate', () => {
    runDeployment(['node', 'script.mjs', 'staging', '--bootstrap-auth'])
    const calls = vi.mocked(cp.spawnSync).mock.calls

    const rootCi = calls.find(c => c[0] === 'npm' && c[1]?.[0] === 'ci')
    expect(rootCi).toBeDefined()

    const functionsCi = calls.find(c => c[0] === 'npm' && c[1]?.[0] === '--prefix' && c[1]?.[1] === 'functions' && c[1]?.[2] === 'ci')
    expect(functionsCi).toBeUndefined()

    const validate = calls.find(c => c[0] === 'npm' && c[1]?.[0] === 'run' && c[1]?.[1] === 'validate:predeploy')
    expect(validate).toBeUndefined()
  })

  it('production deployment fails closed if no project ID is configured', () => {
    expect(() => runDeployment(['node', 'script.mjs', 'production', '--bootstrap-auth']))
      .toThrow('production deployment is disabled until an explicit Firebase project ID is configured.')
    const firebaseCall = vi.mocked(cp.spawnSync).mock.calls.find(c => c[0].endsWith('firebase'))
    expect(firebaseCall).toBeUndefined()
  })

  it('invalid deployment target fails closed', () => {
    expect(() => runDeployment(['node', 'script.mjs', 'invalid-env'])).toThrow('Deployment target must be staging or production.')
  })

  it('fails if branch is not main for staging', () => {
    vi.mocked(cp.spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.includes('branch')) return { status: 0, stdout: 'feat-branch\n' } as any
      if (cmd === 'git' && args?.includes('status')) return { status: 0, stdout: '' } as any
      return { status: 0, stdout: '' } as any
    })
    expect(() => runDeployment(['node', 'script.mjs', 'staging'])).toThrow('Staging deployment is restricted to main.')
  })

  it('firebase.json hosting config does not contain staging build hooks that overwrite production', () => {
    const firebaseJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'))
    const hostingPredeploy = firebaseJson.hosting?.predeploy || []
    const hasStagingBuild = hostingPredeploy.some((cmd: string) => cmd.includes('build:staging'))
    expect(hasStagingBuild).toBe(false)
  })
})
