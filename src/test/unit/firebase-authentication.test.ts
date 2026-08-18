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

function createHarness(options: { persistenceFails?: boolean; signInFails?: boolean; pendingLinkUid?: string } = {}) {
  let listener: ((user: TestUser | null) => void) | undefined
  let errorListener: (() => void) | undefined
  let currentUser: TestUser | null = null
  let pendingLinkUid: string | undefined = options.pendingLinkUid
  const events: string[] = []
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
  const getRedirectResult = vi.fn().mockResolvedValue(null)
  const createGoogleProvider = vi.fn().mockReturnValue({})
  const signInWithRedirect = vi.fn().mockImplementation(() => {
    events.push('sign-in-with-redirect')
    return Promise.resolve(undefined)
  })
  const linkWithRedirect = vi.fn().mockResolvedValue(undefined)
  const signOut = vi.fn().mockResolvedValue(undefined)
  const auth = { get currentUser() { return currentUser } }
  const service = createFirebaseAuthentication({
    auth: auth as never,
    observeAuthState: observeAuthState as never,
    configurePersistence,
    signInAnonymously,
    getRedirectResult,
    createGoogleProvider,
    signInWithRedirect,
    linkWithRedirect,
    signOut,
    getPendingLinkUid: () => pendingLinkUid,
    setPendingLinkUid: (uid) => { pendingLinkUid = uid },
    clearPendingLinkUid: () => { events.push('clear-pending-link'); pendingLinkUid = undefined },
  })
  return {
    service, observeAuthState, configurePersistence, signInAnonymously, unsubscribe,
    getRedirectResult, createGoogleProvider, signInWithRedirect, linkWithRedirect, signOut, events,
    getPendingLinkUid: () => pendingLinkUid,
    setCurrentUser(user: TestUser | null) { currentUser = user },
    report(user: TestUser | null) { currentUser = user; listener?.(user) },
    reportError() { errorListener?.() },
  }
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

  it('starts a Google sign-in redirect for a signed-out user', async () => {
    const harness = createHarness()
    await startSignedOut(harness)

    await expect(harness.service.continueWithGoogle()).resolves.toEqual({ status: 'redirecting' })
    expect(harness.signInWithRedirect).toHaveBeenCalledOnce()
    expect(harness.linkWithRedirect).not.toHaveBeenCalled()
  })

  it('starts a Google link redirect for an anonymous user', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    harness.report({ uid: 'anonymous-user', isAnonymous: true })

    await expect(harness.service.continueWithGoogle()).resolves.toEqual({ status: 'redirecting' })
    expect(harness.linkWithRedirect).toHaveBeenCalledOnce()
    expect(harness.signInWithRedirect).not.toHaveBeenCalled()
    expect(harness.getPendingLinkUid()).toBe('anonymous-user')
  })

  it('does not relink an existing permanent identity', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    harness.report({ uid: 'google-user', isAnonymous: false })

    await expect(harness.service.continueWithGoogle()).resolves.toEqual({ status: 'already-authenticated' })
    expect(harness.signInWithRedirect).not.toHaveBeenCalled()
    expect(harness.linkWithRedirect).not.toHaveBeenCalled()
  })

  it('verifies that a successful anonymous Google link preserves its UID', async () => {
    const harness = createHarness()
    const redirect = deferred<{ user: TestUser } | null>()
    harness.getRedirectResult.mockReturnValueOnce(redirect.promise)
    await startSignedOut(harness)
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    await harness.service.continueWithGoogle()
    harness.report({ uid: 'anonymous-user', isAnonymous: false })
    redirect.resolve({ user: { uid: 'anonymous-user', isAnonymous: false } })

    await vi.waitFor(() => expect(harness.service.getGoogleAuthenticationOutcome()).toEqual({ status: 'succeeded' }))
    expect(harness.service.getSnapshot()).toEqual({ status: 'authenticated', identity: { uid: 'anonymous-user', kind: 'permanent' } })
  })

  it('fails closed and signs out when a link redirect returns a different UID', async () => {
    const harness = createHarness()
    const redirect = deferred<{ user: TestUser } | null>()
    harness.getRedirectResult.mockReturnValueOnce(redirect.promise)
    await startSignedOut(harness)
    harness.report({ uid: 'anonymous-A', isAnonymous: true })
    await harness.service.continueWithGoogle()
    harness.setCurrentUser({ uid: 'unexpected-B', isAnonymous: false })
    redirect.resolve({ user: { uid: 'unexpected-B', isAnonymous: false } })

    await vi.waitFor(() => expect(harness.signOut).toHaveBeenCalledOnce())
    expect(harness.getPendingLinkUid()).toBeUndefined()
    expect(harness.service.getSnapshot()).toEqual({ status: 'error', code: 'identity-invariant-violation' })
    expect(harness.service.getGoogleAuthenticationOutcome()).toEqual({ status: 'failed' })
    expect(harness.signInWithRedirect).not.toHaveBeenCalled()
    expect(harness.linkWithRedirect).toHaveBeenCalledOnce()
  })

  it('clears stale link intent before starting a normal signed-out Google sign-in', async () => {
    const harness = createHarness({ pendingLinkUid: 'stale-anonymous-user' })
    const redirect = deferred<{ user: TestUser } | null>()
    harness.getRedirectResult.mockReturnValueOnce(redirect.promise)
    await startSignedOut(harness)

    await harness.service.continueWithGoogle()

    expect(harness.getPendingLinkUid()).toBeUndefined()
    expect(harness.events).toEqual(['clear-pending-link', 'sign-in-with-redirect'])
    expect(harness.linkWithRedirect).not.toHaveBeenCalled()
    redirect.resolve(null)
  })

  it('processes a redirect success through the centralized auth observer once', async () => {
    const harness = createHarness()
    harness.getRedirectResult.mockResolvedValueOnce({ user: { uid: 'google-user', isAnonymous: false } })
    harness.service.start()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledOnce())
    harness.report({ uid: 'google-user', isAnonymous: false })

    await vi.waitFor(() => expect(harness.service.getGoogleAuthenticationOutcome()).toEqual({ status: 'succeeded' }))
    expect(harness.service.getSnapshot()).toEqual({ status: 'authenticated', identity: { uid: 'google-user', kind: 'permanent' } })
    expect(harness.getRedirectResult).toHaveBeenCalledOnce()
  })

  it('maps a credential collision without replacing the anonymous identity', async () => {
    const harness = createHarness()
    harness.getRedirectResult.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' })
    harness.service.start()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledOnce())
    harness.report({ uid: 'anonymous-user', isAnonymous: true })

    await vi.waitFor(() => expect(harness.service.getGoogleAuthenticationOutcome()).toEqual({ status: 'credential-already-in-use' }))
    expect(harness.service.getSnapshot()).toEqual({ status: 'authenticated', identity: { uid: 'anonymous-user', kind: 'anonymous' } })
    expect(harness.signOut).not.toHaveBeenCalled()
    expect(harness.signInWithRedirect).not.toHaveBeenCalled()
  })

  it('settles a generic redirect failure without corrupting auth state', async () => {
    const harness = createHarness()
    harness.getRedirectResult.mockRejectedValueOnce(new Error('provider failure'))
    await startSignedOut(harness)

    await vi.waitFor(() => expect(harness.service.getGoogleAuthenticationOutcome()).toEqual({ status: 'failed' }))
    expect(harness.service.getSnapshot()).toEqual({ status: 'signedOut' })
  })

  it('settles a cancelled anonymous-link redirect and keeps the anonymous identity', async () => {
    const harness = createHarness()
    const redirect = deferred<{ user: TestUser } | null>()
    harness.getRedirectResult.mockReturnValueOnce(redirect.promise)
    harness.service.start()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledOnce())
    harness.report({ uid: 'anonymous-user', isAnonymous: true })
    await harness.service.continueWithGoogle()
    redirect.resolve(null)

    await vi.waitFor(() => expect(harness.service.getGoogleAuthenticationOutcome()).toEqual({ status: 'cancelled' }))
    expect(harness.getPendingLinkUid()).toBeUndefined()
    expect(harness.service.getSnapshot()).toEqual({ status: 'authenticated', identity: { uid: 'anonymous-user', kind: 'anonymous' } })
  })

  it('processes redirect state once per lifecycle and restarts cleanly', async () => {
    const harness = createHarness()
    await startSignedOut(harness)
    await vi.waitFor(() => expect(harness.getRedirectResult).toHaveBeenCalledOnce())
    harness.service.stop()
    harness.service.start()
    await vi.waitFor(() => expect(harness.observeAuthState).toHaveBeenCalledTimes(2))

    await vi.waitFor(() => expect(harness.getRedirectResult).toHaveBeenCalledTimes(2))
  })
})
