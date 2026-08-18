import { describe, expect, it, vi } from 'vitest'

import { AuthenticationUnavailableError } from '../../application/authentication'
import { createFirebaseAuthentication } from '../../infrastructure/firebase/authentication'

interface TestUser { uid: string; isAnonymous: boolean }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function createHarness(options: { persistenceFails?: boolean; signInFails?: boolean } = {}) {
  let listener: ((user: TestUser | null) => void) | undefined
  let errorListener: (() => void) | undefined
  const unsubscribe = vi.fn()
  const observeAuthState = vi.fn((_auth, next: (user: TestUser | null) => void, onError: () => void) => {
    listener = next
    errorListener = onError
    return unsubscribe
  })
  const configurePersistence = options.persistenceFails
    ? vi.fn().mockRejectedValue(new Error('storage unavailable'))
    : vi.fn().mockResolvedValue(undefined)
  const signInAnonymously = options.signInFails
    ? vi.fn().mockRejectedValue(new Error('sign-in failed'))
    : vi.fn().mockResolvedValue(undefined)
  const service = createFirebaseAuthentication({ auth: {} as never, observeAuthState: observeAuthState as never, configurePersistence, signInAnonymously })
  return { service, observeAuthState, configurePersistence, signInAnonymously, unsubscribe, report(user: TestUser | null) { listener?.(user) }, reportError() { errorListener?.() } }
}

async function startSignedOut(harness: ReturnType<typeof createHarness>) {
  harness.service.start()
  await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledOnce())
  harness.report(null)
}

describe('Firebase authentication lifecycle', () => {
  it('stays unresolved until Firebase reports an auth state', async () => {
    const harness = createHarness()
    harness.service.start()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledOnce())
    expect(harness.service.getSnapshot()).toEqual({ status: 'initializing' })
    expect(harness.configurePersistence).toHaveBeenCalledOnce()
  })

  it('restores an existing identity without creating an anonymous account', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    harness.report({ uid: 'restored-user', isAnonymous: false })
    await expect(harness.service.ensureAnonymousIdentity()).resolves.toEqual({ uid: 'restored-user', kind: 'permanent' })
    expect(harness.signInAnonymously).not.toHaveBeenCalled()
  })

  it('creates an anonymous identity only when Firebase reported signed out', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    const identity = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledOnce())
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    await expect(identity).resolves.toEqual({ uid: 'anonymous-user', kind: 'anonymous' })
  })

  it('does not create another identity when already authenticated', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    await harness.service.ensureAnonymousIdentity()
    expect(harness.signInAnonymously).not.toHaveBeenCalled()
  })

  it('shares a single anonymous sign-in across concurrent calls', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    const first = harness.service.ensureAnonymousIdentity()
    const second = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledOnce())
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { uid: 'anonymous-user', kind: 'anonymous' },
      { uid: 'anonymous-user', kind: 'anonymous' },
    ])
  })

  it('fails closed when browser-local persistence cannot be configured', async () => {
    const harness = createHarness({ persistenceFails: true })
    harness.service.start()
    await vi.waitFor(() => expect(harness.service.getSnapshot()).toEqual({ status: 'error', code: 'persistence-unavailable' }))
    await expect(harness.service.ensureAnonymousIdentity()).rejects.toBeInstanceOf(AuthenticationUnavailableError)
    expect(harness.observeAuthState).not.toHaveBeenCalled()
    expect(harness.signInAnonymously).not.toHaveBeenCalled()
  })

  it('can retry persistence initialization after a recoverable failure', async () => {
    const harness = createHarness({ persistenceFails: true })
    harness.service.start()
    await vi.waitFor(() => expect(harness.service.getSnapshot().status).toBe('error'))
    harness.configurePersistence.mockResolvedValueOnce(undefined)
    harness.service.retry()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledOnce())
    harness.report(null)
    expect(harness.service.getSnapshot()).toEqual({ status: 'signedOut' })
  })

  it('settles an identity request stopped during persistence initialization', async () => {
    const harness = createHarness()
    const persistence = deferred<void>()
    harness.configurePersistence.mockReturnValueOnce(persistence.promise)

    const identity = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.configurePersistence).toHaveBeenCalledOnce())
    harness.service.stop()

    await expect(identity).rejects.toBeInstanceOf(AuthenticationUnavailableError)
    expect(harness.signInAnonymously).not.toHaveBeenCalled()
    persistence.resolve(undefined)
  })

  it('keeps application subscribers through retry', async () => {
    const harness = createHarness({ persistenceFails: true })
    const observedStates: string[] = []
    harness.service.subscribe(() => observedStates.push(harness.service.getSnapshot().status))

    harness.service.start()
    await vi.waitFor(() => expect(harness.service.getSnapshot().status).toBe('error'))
    expect(observedStates).toContain('error')

    harness.configurePersistence.mockResolvedValueOnce(undefined)
    harness.service.retry()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledOnce())
    const eventsBeforeAuthState = observedStates.length
    harness.report(null)

    expect(observedStates).toHaveLength(eventsBeforeAuthState + 1)
    expect(observedStates.at(-1)).toBe('signedOut')
  })

  it('clears a failed Firebase anonymous sign-in so a later call can retry', async () => {
    const harness = createHarness({ signInFails: true })
    await startSignedOut(harness)
    await expect(harness.service.ensureAnonymousIdentity()).rejects.toThrow('sign-in failed')
    harness.signInAnonymously.mockResolvedValueOnce(undefined)
    const retry = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledTimes(2))
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    await expect(retry).resolves.toEqual({ uid: 'anonymous-user', kind: 'anonymous' })
  })

  it('rejects an interrupted anonymous sign-in when Firebase reports signed out', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    const identity = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledOnce())
    harness.report(null)
    await expect(identity).rejects.toBeInstanceOf(AuthenticationUnavailableError)
  })

  it('rejects an interrupted anonymous sign-in when Firebase reports an error', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    const identity = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledOnce())
    harness.reportError()
    await expect(identity).rejects.toBeInstanceOf(AuthenticationUnavailableError)
  })

  it('stops deterministically and permits a later service restart', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    const identity = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledOnce())
    harness.service.stop()
    await expect(identity).rejects.toBeInstanceOf(AuthenticationUnavailableError)
    expect(harness.unsubscribe).toHaveBeenCalledOnce()
    harness.service.start()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledTimes(2))
  })

  it('aborts an anonymous sign-in that resolves after its lifecycle stopped', async () => {
    const harness = createHarness()
    const signIn = deferred<unknown>()
    harness.signInAnonymously.mockReturnValueOnce(signIn.promise)
    await startSignedOut(harness)

    const identity = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledOnce())
    harness.service.stop()
    signIn.resolve(undefined)

    await expect(identity).rejects.toBeInstanceOf(AuthenticationUnavailableError)
    harness.service.start()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledTimes(2))
    harness.report(null)

    const retry = harness.service.ensureAnonymousIdentity()
    await vi.waitFor(() => expect(harness.signInAnonymously).toHaveBeenCalledTimes(2))
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    await expect(retry).resolves.toEqual({ uid: 'anonymous-user', kind: 'anonymous' })
  })

  it('maps Firebase anonymous and permanent users to the public identity projection', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    expect(harness.service.getSnapshot()).toEqual({ status: 'authenticated', identity: { uid: 'anonymous-user', kind: 'anonymous' } })
    harness.report({ uid: 'linked-user', isAnonymous: false })
    expect(harness.service.getSnapshot()).toEqual({ status: 'authenticated', identity: { uid: 'linked-user', kind: 'permanent' } })
  })
})
