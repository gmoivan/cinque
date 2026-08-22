import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithRedirect,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithRedirect,
  signOut,
  type Auth,
  type AuthProvider,
  type User,
  type UserCredential,
} from 'firebase/auth'

import {
  AuthenticationUnavailableError,
  type AuthIdentity,
  type AuthenticationService,
  type AuthenticationState,
  type GoogleAuthenticationOutcome,
} from '../../application/authentication'

import { firebaseAuth } from './config'

type AuthObserver = (
  auth: Auth,
  next: (user: User | null) => void,
  onError: () => void,
) => () => void
type AnonymousSignIn = (auth: Auth) => Promise<unknown>
type RedirectResult = (auth: Auth) => Promise<UserCredential | null>
type GoogleRedirectSignIn = (auth: Auth, provider: AuthProvider) => Promise<unknown>
type GoogleRedirectLink = (user: User, provider: AuthProvider) => Promise<unknown>

interface FirebaseAuthenticationDependencies {
  auth: Auth
  observeAuthState: AuthObserver
  configurePersistence: (auth: Auth) => Promise<void>
  signInAnonymously: AnonymousSignIn
  getRedirectResult: RedirectResult
  createGoogleProvider: () => AuthProvider
  signInWithRedirect: GoogleRedirectSignIn
  linkWithRedirect: GoogleRedirectLink
  signOut: (auth: Auth) => Promise<void>
  getPendingLinkUid: () => string | undefined
  setPendingLinkUid: (uid: string) => void
  clearPendingLinkUid: () => void
}

const initializingState: AuthenticationState = { status: 'initializing' }
const signedOutState: AuthenticationState = { status: 'signedOut' }
const persistenceErrorState: AuthenticationState = { status: 'error', code: 'persistence-unavailable' }
const identityInvariantErrorState: AuthenticationState = {
  status: 'error',
  code: 'identity-invariant-violation',
}
const idleGoogleOutcome: GoogleAuthenticationOutcome = { status: 'idle' }

function browserPendingLinkStore() {
  const key = 'cinque.auth.pending-google-link-uid'

  return {
    get: () => globalThis.sessionStorage?.getItem(key) ?? undefined,
    set: (uid: string) => globalThis.sessionStorage?.setItem(key, uid),
    clear: () => globalThis.sessionStorage?.removeItem(key),
  }
}

function googleOutcomeFromError(error: unknown): GoogleAuthenticationOutcome {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined

  if (code === 'auth/popup-closed-by-user' || code === 'auth/redirect-cancelled-by-user') {
    return { status: 'cancelled' }
  }

  const safeCode = typeof code === 'string' ? code : undefined

  if (safeCode) {
    console.error('[Authentication] Google Authentication failed.', { code: safeCode })
  } else {
    console.error('Google Authentication failed with an unknown error.')
  }

  return { status: 'failed', code: safeCode }
}

function projectIdentity(user: User): AuthIdentity {
  return { uid: user.uid, kind: user.isAnonymous ? 'anonymous' : 'permanent' }
}

export class FirebaseAuthenticationService implements AuthenticationService {
  private readonly dependencies: FirebaseAuthenticationDependencies
  private state: AuthenticationState = initializingState
  private readonly listeners = new Set<() => void>()
  private unsubscribe?: () => void
  private initialization?: Promise<void>
  private resolveInitialization?: () => void
  private anonymousIdentityRequest?: Promise<AuthIdentity>
  private readonly stateWaiters = new Set<() => void>()
  private lifecycle = 0
  private googleOutcome: GoogleAuthenticationOutcome = idleGoogleOutcome
  private redirectResultProcessing?: Promise<void>
  private identityInvariantViolation?: Promise<void>
  private identityInvariantViolationLifecycle?: number

  constructor(dependencies: FirebaseAuthenticationDependencies) {
    this.dependencies = dependencies
  }

  start() {
    if (this.initialization) return

    this.state = initializingState
    this.emit()
    const lifecycle = ++this.lifecycle
    this.initialization = new Promise<void>((resolve) => { this.resolveInitialization = resolve })

    void Promise.resolve()
      .then(() => this.dependencies.configurePersistence(this.dependencies.auth))
      .then(
        () => {
          if (this.lifecycle === lifecycle) {
            this.observe()
            this.processRedirectResult(lifecycle)
          }
        },
        () => {
          if (this.lifecycle === lifecycle) {
            this.transition(persistenceErrorState)
            this.settleInitialization()
          }
        },
      )
  }

  retry() {
    if (this.state.status !== 'error') return
    this.stop()
    this.start()
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot() { return this.state }

  async ensureAnonymousIdentity() {
    this.start()
    const initialization = this.initialization
    const lifecycle = this.lifecycle
    await initialization
    if (this.state.status === 'authenticated') return this.state.identity
    if (this.state.status === 'error' || lifecycle !== this.lifecycle) throw new AuthenticationUnavailableError()

    const request = this.anonymousIdentityRequest ?? this.createAnonymousIdentity()
    if (!this.anonymousIdentityRequest) this.anonymousIdentityRequest = request
    try {
      return await request
    } finally {
      if (this.anonymousIdentityRequest === request) this.anonymousIdentityRequest = undefined
    }
  }

  async continueWithGoogle(): Promise<GoogleAuthenticationOutcome> {
    this.start()
    await this.initialization
    if (this.state.status === 'error') throw new AuthenticationUnavailableError()
    if (this.state.status === 'authenticated' && this.state.identity.kind === 'permanent') {
      return this.setGoogleOutcome({ status: 'already-authenticated' })
    }

    const provider = this.dependencies.createGoogleProvider()
    this.setGoogleOutcome({ status: 'redirecting' })
    try {
      if (this.state.status === 'authenticated') {
        const user = this.dependencies.auth.currentUser
        if (!user || user.uid !== this.state.identity.uid || !user.isAnonymous) {
          return this.setGoogleOutcome({ status: 'failed' })
        }
        this.dependencies.setPendingLinkUid(user.uid)
        await this.dependencies.linkWithRedirect(user, provider)
      } else {
        this.dependencies.clearPendingLinkUid()
        await this.dependencies.signInWithRedirect(this.dependencies.auth, provider)
      }
      return this.googleOutcome
    } catch (error) {
      this.dependencies.clearPendingLinkUid()
      return this.setGoogleOutcome(googleOutcomeFromError(error))
    }
  }

  getGoogleAuthenticationOutcome() { return this.googleOutcome }

  stop() {
    ++this.lifecycle
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.transition(signedOutState)
    this.stateWaiters.clear()
    this.settleInitialization()
    this.initialization = undefined
    this.anonymousIdentityRequest = undefined
    this.redirectResultProcessing = undefined
    this.identityInvariantViolation = undefined
    this.identityInvariantViolationLifecycle = undefined
  }

  private observe() {
    this.unsubscribe = this.dependencies.observeAuthState(
      this.dependencies.auth,
      (user) => {
        if (this.identityInvariantViolationLifecycle === this.lifecycle) return
        const expectedLinkUid = this.dependencies.getPendingLinkUid()
        if (expectedLinkUid && user && !user.isAnonymous && user.uid !== expectedLinkUid) {
          void this.failIdentityInvariant()
          return
        }
        this.state = user ? { status: 'authenticated', identity: projectIdentity(user) } : signedOutState
        this.settleInitialization()
        this.emit()
      },
      () => {
        this.transition(persistenceErrorState)
        this.settleInitialization()
      },
    )
  }

  private processRedirectResult(lifecycle: number) {
    this.redirectResultProcessing ??= this.dependencies.getRedirectResult(this.dependencies.auth)
      .then(async (result) => {
        if (this.lifecycle !== lifecycle) return
        if (!result) {
          if (this.dependencies.getPendingLinkUid()) {
            this.dependencies.clearPendingLinkUid()
            this.setGoogleOutcome({ status: 'cancelled' })
          }
          return
        }
        const expectedLinkUid = this.dependencies.getPendingLinkUid()
        if (this.identityInvariantViolation || (expectedLinkUid && result.user.uid !== expectedLinkUid)) {
          await this.failIdentityInvariant()
          return
        }
        this.dependencies.clearPendingLinkUid()
        this.setGoogleOutcome({ status: 'succeeded' })
      })
      .catch((error: unknown) => {
        if (this.lifecycle !== lifecycle) return
        this.dependencies.clearPendingLinkUid()
        this.setGoogleOutcome(googleOutcomeFromError(error))
      })
  }

  private failIdentityInvariant() {
    this.identityInvariantViolation ??= (async () => {
      this.identityInvariantViolationLifecycle = this.lifecycle
      this.dependencies.clearPendingLinkUid()
      this.setGoogleOutcome({ status: 'failed' })
      this.transition(identityInvariantErrorState)
      try {
        await this.dependencies.signOut(this.dependencies.auth)
      } catch {
        // The application remains fail-closed even if Firebase cleanup fails.
      }
    })()
    return this.identityInvariantViolation
  }

  private async createAnonymousIdentity() {
    const lifecycle = this.lifecycle
    await this.dependencies.signInAnonymously(this.dependencies.auth)
    if (lifecycle !== this.lifecycle) throw new AuthenticationUnavailableError()
    if (this.state.status === 'authenticated') return this.state.identity
    if (this.state.status === 'error') throw new AuthenticationUnavailableError()

    return new Promise<AuthIdentity>((resolve, reject) => {
      const waitForAuthState = () => {
        if (this.state.status === 'authenticated') {
          this.stateWaiters.delete(waitForAuthState)
          resolve(this.state.identity)
        } else if (this.state.status === 'signedOut' || this.state.status === 'error') {
          this.stateWaiters.delete(waitForAuthState)
          reject(new AuthenticationUnavailableError())
        }
      }
      this.stateWaiters.add(waitForAuthState)
    })
  }

  private transition(state: AuthenticationState) {
    this.state = state
    this.emit()
  }

  private setGoogleOutcome(outcome: GoogleAuthenticationOutcome) {
    this.googleOutcome = outcome
    this.emit()
    return outcome
  }

  private settleInitialization() {
    this.resolveInitialization?.()
    this.resolveInitialization = undefined
  }

  private emit() {
    for (const listener of this.listeners) listener()
    for (const waiter of this.stateWaiters) waiter()
  }
}

export function createFirebaseAuthentication(
  dependencies: Partial<FirebaseAuthenticationDependencies> = {},
): FirebaseAuthenticationService {
  const pendingLinkStore = browserPendingLinkStore()
  return new FirebaseAuthenticationService({
    auth: dependencies.auth ?? firebaseAuth,
    observeAuthState: dependencies.observeAuthState ?? onAuthStateChanged,
    configurePersistence: dependencies.configurePersistence ?? ((auth) => setPersistence(auth, browserLocalPersistence)),
    signInAnonymously: dependencies.signInAnonymously ?? signInAnonymously,
    getRedirectResult: dependencies.getRedirectResult ?? getRedirectResult,
    createGoogleProvider: dependencies.createGoogleProvider ?? (() => new GoogleAuthProvider()),
    signInWithRedirect: dependencies.signInWithRedirect ?? signInWithRedirect,
    linkWithRedirect: dependencies.linkWithRedirect ?? linkWithRedirect,
    signOut: dependencies.signOut ?? signOut,
    getPendingLinkUid: dependencies.getPendingLinkUid ?? pendingLinkStore.get,
    setPendingLinkUid: dependencies.setPendingLinkUid ?? pendingLinkStore.set,
    clearPendingLinkUid: dependencies.clearPendingLinkUid ?? pendingLinkStore.clear,
  })
}

export const firebaseAuthentication = createFirebaseAuthentication()
