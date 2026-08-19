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

export interface JoinSessionInput {
  readonly code: string
  readonly displayName: string
}

export interface JoinedSession {
  readonly sessionId: string
  readonly code: string
  readonly status: string
  readonly targetScore: number
  readonly displayName: string
  readonly playerCount: number
}

export interface StartSessionInput {
  readonly sessionId: string
}

export interface StartedSession {
  readonly sessionId: string
  readonly status: 'active'
  readonly playerCount: number
}

export interface CurrentSession {
  readonly sessionId: string
  readonly hostUid: string
  readonly status: string
  readonly playerCount: number
  readonly totalScore: number
  readonly winnerUid?: string
  readonly winningTotalScore?: number
  readonly winningScoreCommandId?: string
}

export interface RecordScoreInput {
  readonly sessionId: string
  readonly points: number
  readonly commandId: string
}

export interface RecordedScore {
  readonly sessionId: string
  readonly points: number
  readonly totalScore: number
  readonly commandId: string
  readonly winnerUid?: string
  readonly winningTotalScore?: number
  readonly winningScoreCommandId?: string
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

export type JoinSessionErrorCode =
  | 'authentication-required'
  | 'invalid-code'
  | 'session-not-found'
  | 'session-full'
  | 'display-name-taken'
  | 'session-not-joinable'
  | 'unavailable'

export class JoinSessionError extends Error {
  readonly code: JoinSessionErrorCode

  constructor(code: JoinSessionErrorCode) {
    super(code)
    this.name = 'JoinSessionError'
    this.code = code
  }
}

export type StartSessionErrorCode =
  | 'authentication-required'
  | 'invalid-input'
  | 'session-not-found'
  | 'not-enough-players'
  | 'not-host'
  | 'session-not-startable'
  | 'unavailable'

export class StartSessionError extends Error {
  readonly code: StartSessionErrorCode

  constructor(code: StartSessionErrorCode) {
    super(code)
    this.name = 'StartSessionError'
    this.code = code
  }
}

export type RecordScoreErrorCode =
  | 'authentication-required'
  | 'invalid-input'
  | 'session-not-active'
  | 'not-session-member'
  | 'idempotency-conflict'
  | 'unavailable'

export class RecordScoreError extends Error {
  readonly code: RecordScoreErrorCode

  constructor(code: RecordScoreErrorCode) {
    super(code)
    this.name = 'RecordScoreError'
    this.code = code
  }
}

export interface SessionService {
  createSession(input: CreateSessionInput): Promise<CreatedSession>
  joinSession(input: JoinSessionInput): Promise<JoinedSession>
  startSession(input: StartSessionInput): Promise<StartedSession>
  recordScore(input: RecordScoreInput): Promise<RecordedScore>
  getSession(sessionId: string, playerUid: string): Promise<CurrentSession>
}
