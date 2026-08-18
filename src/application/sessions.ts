export interface CreateSessionInput {
  readonly displayName: string
  readonly targetScore: number
}

export interface CreatedSession {
  readonly sessionId: string
  readonly code: string
  readonly status: 'lobby'
  readonly targetScore: number
}

export type CreateSessionErrorCode = 'authentication-required' | 'invalid-input' | 'unavailable'

export class CreateSessionError extends Error {
  readonly code: CreateSessionErrorCode

  constructor(code: CreateSessionErrorCode) {
    super(code)
    this.name = 'CreateSessionError'
    this.code = code
  }
}

export interface SessionCreationService {
  createSession(input: CreateSessionInput): Promise<CreatedSession>
}
