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
      production: { projectId: 'cinque-production-gmoiv' },
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
})
