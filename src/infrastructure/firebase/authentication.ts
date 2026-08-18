import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  type Auth,
  type User,
} from 'firebase/auth'

import {
  AuthenticationUnavailableError,
  type AuthIdentity,
  type AuthenticationService,
  type AuthenticationState,
} from '../../application/authentication'

import { firebaseAuth } from './config'

type AuthObserver = (
  auth: Auth,
  next: (user: User | null) => void,
  onError: () => void,
) => () => void
type AnonymousSignIn = (auth: Auth) => Promise<unknown>

interface FirebaseAuthenticationDependencies {
  auth: Auth
  observeAuthState: AuthObserver
  configurePersistence: (auth: Auth) => Promise<void>
  signInAnonymously: AnonymousSignIn
}

const initializingState: AuthenticationState = { status: 'initializing' }
const signedOutState: AuthenticationState = { status: 'signedOut' }
const persistenceErrorState: AuthenticationState = {
  status: 'error',
  code: 'persistence-unavailable',
}

function projectIdentity(user: User): AuthIdentity {
  return {
    uid: user.uid,
    kind: user.isAnonymous ? 'anonymous' : 'permanent',
  }
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

  constructor(dependencies: FirebaseAuthenticationDependencies) {
    this.dependencies = dependencies
  }

  start() {
    if (this.initialization) {
      return
    }

    this.state = initializingState
    this.emit()
    const lifecycle = ++this.lifecycle
    this.initialization = new Promise<void>((resolve) => {
      this.resolveInitialization = resolve
    })

    void Promise.resolve()
      .then(() => this.dependencies.configurePersistence(this.dependencies.auth))
      .then(
        () => {
          if (this.lifecycle === lifecycle) {
            this.observe()
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
    if (this.state.status !== 'error') {
      return
    }

    this.stop()
    this.start()
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot() {
    return this.state
  }

  async ensureAnonymousIdentity() {
    this.start()
    const initialization = this.initialization
    const lifecycle = this.lifecycle
    await initialization

    if (this.state.status === 'authenticated') {
      return this.state.identity
    }

    if (this.state.status === 'error' || lifecycle !== this.lifecycle) {
      throw new AuthenticationUnavailableError()
    }

    const anonymousIdentityRequest =
      this.anonymousIdentityRequest ?? this.createAnonymousIdentity()
    if (!this.anonymousIdentityRequest) {
      this.anonymousIdentityRequest = anonymousIdentityRequest
    }

    try {
      return await anonymousIdentityRequest
    } finally {
      if (this.anonymousIdentityRequest === anonymousIdentityRequest) {
        this.anonymousIdentityRequest = undefined
      }
    }
  }

  stop() {
    ++this.lifecycle
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.transition(signedOutState)
    this.stateWaiters.clear()
    this.settleInitialization()
    this.initialization = undefined
    this.anonymousIdentityRequest = undefined
  }

  private observe() {
    this.unsubscribe = this.dependencies.observeAuthState(
      this.dependencies.auth,
      (user) => {
        this.state = user
          ? { status: 'authenticated', identity: projectIdentity(user) }
          : signedOutState
        this.settleInitialization()
        this.emit()
      },
      () => {
        this.transition(persistenceErrorState)
        this.settleInitialization()
      },
    )
  }

  private async createAnonymousIdentity() {
    const lifecycle = this.lifecycle
    await this.dependencies.signInAnonymously(this.dependencies.auth)

    if (lifecycle !== this.lifecycle) {
      throw new AuthenticationUnavailableError()
    }

    if (this.state.status === 'authenticated') {
      return this.state.identity
    }

    if (this.state.status === 'error') {
      throw new AuthenticationUnavailableError()
    }

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

  private settleInitialization() {
    this.resolveInitialization?.()
    this.resolveInitialization = undefined
  }

  private emit() {
    for (const listener of this.listeners) {
      listener()
    }

    for (const waiter of this.stateWaiters) {
      waiter()
    }
  }
}

export function createFirebaseAuthentication(
  dependencies: Partial<FirebaseAuthenticationDependencies> = {},
): FirebaseAuthenticationService {
  return new FirebaseAuthenticationService({
    auth: dependencies.auth ?? firebaseAuth,
    observeAuthState: dependencies.observeAuthState ?? onAuthStateChanged,
    configurePersistence:
      dependencies.configurePersistence ?? ((auth) => setPersistence(auth, browserLocalPersistence)),
    signInAnonymously: dependencies.signInAnonymously ?? signInAnonymously,
  })
}

export const firebaseAuthentication = createFirebaseAuthentication()
