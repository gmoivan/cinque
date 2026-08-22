export type AuthIdentityKind = 'anonymous' | 'permanent'

export interface AuthIdentity {
  readonly uid: string
  readonly kind: AuthIdentityKind
}

export type AuthenticationState =
  | { readonly status: 'initializing' }
  | { readonly status: 'signedOut' }
  | { readonly status: 'authenticated'; readonly identity: AuthIdentity }
  | {
      readonly status: 'error'
      readonly code: 'persistence-unavailable' | 'identity-invariant-violation'
    }

export type GoogleAuthenticationOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'redirecting' }
  | { readonly status: 'succeeded' }
  | { readonly status: 'already-authenticated' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly code?: string }

export class AuthenticationUnavailableError extends Error {
  constructor() {
    super('Authentication is unavailable until it is restarted.')
    this.name = 'AuthenticationUnavailableError'
  }
}

export interface AuthenticationService {
  start(): void
  retry(): void
  stop(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): AuthenticationState
  ensureAnonymousIdentity(): Promise<AuthIdentity>
  continueWithGoogle(): Promise<GoogleAuthenticationOutcome>
  getGoogleAuthenticationOutcome(): GoogleAuthenticationOutcome
  signOut(): Promise<void>
}
