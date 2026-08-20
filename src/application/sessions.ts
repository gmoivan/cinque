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

export interface FinalizeGameInput { readonly sessionId: string; readonly commandId: string }
export interface FinalizedGame { readonly sessionId: string; readonly status: 'finished'; readonly commandId: string; readonly winnerUid: string; readonly winningTotalScore: number; readonly winningScoreCommandId: string }
export interface ReopenGameInput { readonly sessionId: string; readonly reason: string; readonly commandId: string }
export interface ReopenedGame { readonly sessionId: string; readonly status: 'active'; readonly commandId: string }

export interface CurrentSession {
  readonly sessionId: string
  readonly code: string
  readonly hostUid: string
  readonly status: string
  readonly targetScore: number
  readonly playerCount: number
  readonly totalScore: number
  readonly players: readonly SessionPlayer[]
  readonly winnerUid?: string
  readonly winningTotalScore?: number
  readonly winningScoreCommandId?: string
  readonly scoreEntries: readonly ScoreEntry[]
}

export interface SessionPlayer {
  readonly uid: string
  readonly displayName: string
  readonly totalScore: number
}

export interface RecentSession {
  readonly sessionId: string
  readonly code: string
  readonly displayName: string
  readonly role: 'host' | 'player'
  readonly targetScore: number
  readonly status: string
}

export interface ScoreEntry {
  readonly ownerUid: string
  readonly ownerDisplayName: string
  readonly entryId: string
  readonly points: number
  readonly originalPoints?: number
  readonly effectivePoints?: number
  readonly isCorrected?: boolean
  readonly sequence: number
  readonly reports?: readonly ScoreReport[]
}

export interface ScoreReport {
  readonly reportId: string
  readonly reporterUid: string
  readonly reason: string
  readonly proposedPoints?: number
  readonly status: 'open' | 'resolved'
  readonly outcome?: 'accepted' | 'rejected'
  readonly resolutionReason?: string
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
  readonly sequence: number
  readonly winnerUid?: string
  readonly winningTotalScore?: number
  readonly winningScoreCommandId?: string
}

export interface ReportScoreInput {
  readonly sessionId: string
  readonly scoreOwnerUid: string
  readonly scoreEntryId: string
  readonly reason: string
  readonly proposedPoints?: number
  readonly commandId: string
}

export interface ReportedScore {
  readonly sessionId: string
  readonly scoreOwnerUid: string
  readonly scoreEntryId: string
  readonly commandId: string
  readonly status: 'open'
}

export interface ResolveScoreReportInput {
  readonly sessionId: string
  readonly reportId: string
  readonly outcome: 'accepted' | 'rejected'
  readonly correctedScore?: number
  readonly reason?: string
  readonly commandId: string
}

export interface ResolvedScoreReport {
  readonly sessionId: string
  readonly reportId: string
  readonly commandId: string
  readonly outcome: 'accepted' | 'rejected'
  readonly correctedScore?: number
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

export type FinalizeGameErrorCode = 'authentication-required' | 'invalid-input' | 'session-not-found' | 'not-host' | 'no-winner-detected' | 'open-score-reports' | 'session-finalized' | 'idempotency-conflict' | 'unavailable'
export class FinalizeGameError extends Error { readonly code: FinalizeGameErrorCode; constructor(code: FinalizeGameErrorCode) { super(code); this.name = 'FinalizeGameError'; this.code = code } }

export type ReopenGameErrorCode = 'authentication-required' | 'invalid-input' | 'session-not-found' | 'session-not-finished' | 'not-host' | 'idempotency-conflict' | 'unavailable'
export class ReopenGameError extends Error { readonly code: ReopenGameErrorCode; constructor(code: ReopenGameErrorCode) { super(code); this.name = 'ReopenGameError'; this.code = code } }

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

export type ReportScoreErrorCode = 'authentication-required' | 'invalid-input' | 'not-session-member' | 'score-not-found' | 'cannot-report-own-score' | 'open-report-exists' | 'session-finalized' | 'idempotency-conflict' | 'unavailable'

export class ReportScoreError extends Error {
  readonly code: ReportScoreErrorCode

  constructor(code: ReportScoreErrorCode) {
    super(code)
    this.name = 'ReportScoreError'
    this.code = code
  }
}

export type ResolveScoreReportErrorCode = 'authentication-required' | 'invalid-input' | 'not-session-member' | 'report-not-found' | 'not-score-owner' | 'session-finalized' | 'already-resolved' | 'idempotency-conflict' | 'unavailable'
export class ResolveScoreReportError extends Error { readonly code: ResolveScoreReportErrorCode; constructor(code: ResolveScoreReportErrorCode) { super(code); this.name = 'ResolveScoreReportError'; this.code = code } }

export interface SessionService {
  createSession(input: CreateSessionInput): Promise<CreatedSession>
  joinSession(input: JoinSessionInput): Promise<JoinedSession>
  startSession(input: StartSessionInput): Promise<StartedSession>
  finalizeGame(input: FinalizeGameInput): Promise<FinalizedGame>
  reopenGame(input: ReopenGameInput): Promise<ReopenedGame>
  preserveSession(sessionId: string): Promise<void>
  recordScore(input: RecordScoreInput): Promise<RecordedScore>
  reportScore(input: ReportScoreInput): Promise<ReportedScore>
  resolveScoreReport(input: ResolveScoreReportInput): Promise<ResolvedScoreReport>
  getSession(sessionId: string, playerUid: string): Promise<CurrentSession>
  listRecentSessions(playerUid: string): Promise<readonly RecentSession[]>
  subscribeToSession(sessionId: string, playerUid: string, onSession: (session: CurrentSession) => void, onError: () => void): () => void
}
