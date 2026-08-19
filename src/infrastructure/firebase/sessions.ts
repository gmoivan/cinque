import { httpsCallable, type Functions } from 'firebase/functions'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'

import {
  CreateSessionError,
  type CreateSessionInput,
  type CreatedSession,
  type CurrentSession,
  JoinSessionError,
  type JoinSessionInput,
  type JoinedSession,
  StartSessionError,
  type StartSessionInput,
  type StartedSession,
  type SessionService,
  RecordScoreError,
  type RecordScoreInput,
  type RecordedScore,
  ReportScoreError,
  type ReportScoreInput,
  type ReportedScore,
  type ScoreEntry,
} from '../../application/sessions'

import { firebaseFirestore, firebaseFunctions } from './config'
import { orderScoreEntries } from './scoreOrdering'

type CallableCreateSessionResult = CreatedSession
type CallableJoinSessionResult = JoinedSession
type CallableStartSessionResult = StartedSession
type CallableRecordScoreResult = RecordedScore
type CallableReportScoreResult = ReportedScore

function toCreateSessionError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  if (code === 'functions/unauthenticated') return new CreateSessionError('authentication-required')
  if (code === 'functions/invalid-argument') return new CreateSessionError('invalid-input')
  return new CreateSessionError('unavailable')
}

function toJoinSessionError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new JoinSessionError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new JoinSessionError('invalid-code')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details
    ? (callableError.details as { reason?: unknown }).reason
    : undefined
  if (reason === 'session-not-found' || reason === 'session-full' || reason === 'display-name-taken' || reason === 'session-not-joinable') {
    return new JoinSessionError(reason)
  }
  return new JoinSessionError('unavailable')
}

function toStartSessionError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new StartSessionError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new StartSessionError('invalid-input')
  if (callableError?.code === 'functions/permission-denied') return new StartSessionError('not-host')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details
    ? (callableError.details as { reason?: unknown }).reason
    : undefined
  if (reason === 'session-not-found' || reason === 'not-enough-players' || reason === 'session-not-startable') {
    return new StartSessionError(reason)
  }
  return new StartSessionError('unavailable')
}

function toRecordScoreError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new RecordScoreError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new RecordScoreError('invalid-input')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details
    ? (callableError.details as { reason?: unknown }).reason
    : undefined
  if (reason === 'session-not-active' || reason === 'not-session-member' || reason === 'idempotency-conflict') return new RecordScoreError(reason)
  return new RecordScoreError('unavailable')
}

function toReportScoreError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new ReportScoreError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new ReportScoreError('invalid-input')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details ? (callableError.details as { reason?: unknown }).reason : undefined
  if (reason === 'not-session-member' || reason === 'score-not-found' || reason === 'cannot-report-own-score' || reason === 'open-report-exists' || reason === 'idempotency-conflict') return new ReportScoreError(reason)
  return new ReportScoreError('unavailable')
}

export class FirebaseSessionService implements SessionService {
  private readonly functions: Functions

  constructor(functions: Functions = firebaseFunctions) {
    this.functions = functions
  }

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    try {
      const callable = httpsCallable<CreateSessionInput, CallableCreateSessionResult>(this.functions, 'createSession')
      return (await callable(input)).data
    } catch (error) {
      throw toCreateSessionError(error)
    }
  }

  async joinSession(input: JoinSessionInput): Promise<JoinedSession> {
    try {
      const callable = httpsCallable<JoinSessionInput, CallableJoinSessionResult>(this.functions, 'joinSession')
      return (await callable(input)).data
    } catch (error) {
      throw toJoinSessionError(error)
    }
  }

  async startSession(input: StartSessionInput): Promise<StartedSession> {
    try {
      const callable = httpsCallable<StartSessionInput, CallableStartSessionResult>(this.functions, 'startSession')
      return (await callable(input)).data
    } catch (error) {
      throw toStartSessionError(error)
    }
  }

  async recordScore(input: RecordScoreInput): Promise<RecordedScore> {
    try {
      const callable = httpsCallable<RecordScoreInput, CallableRecordScoreResult>(this.functions, 'recordScore')
      return (await callable(input)).data
    } catch (error) {
      throw toRecordScoreError(error)
    }
  }

  async reportScore(input: ReportScoreInput): Promise<ReportedScore> {
    try {
      const callable = httpsCallable<ReportScoreInput, CallableReportScoreResult>(this.functions, 'reportScore')
      return (await callable(input)).data
    } catch (error) {
      throw toReportScoreError(error)
    }
  }

  async getSession(sessionId: string, playerUid: string): Promise<CurrentSession> {
    try {
      const [sessionSnapshots, reportSnapshots] = await Promise.all([
        getDocs(collection(firebaseFirestore, 'sessions', sessionId, 'players')),
        getDocs(collection(firebaseFirestore, 'sessions', sessionId, 'scoreReports')),
      ])
      const snapshot = await getDoc(doc(firebaseFirestore, 'sessions', sessionId))
      const data = snapshot.data()
      const playerSnapshot = sessionSnapshots.docs.find((candidate) => candidate.id === playerUid)
      const player = playerSnapshot?.data()
      const winnerValues = [data?.winnerUid, data?.winnerDetectedAt, data?.winningTotalScore, data?.winningScoreCommandId]
      const hasWinner = winnerValues.every((value) => value !== undefined)
      if (!snapshot.exists() || !data || typeof data.hostUid !== 'string' || typeof data.status !== 'string' || !Number.isInteger(data.playerCount) ||
        !playerSnapshot || !player || !Number.isInteger(player.totalScore) || player.totalScore < 0) {
        throw new Error('Invalid session state.')
      }
      if (winnerValues.some((value) => value !== undefined) && (!hasWinner || typeof data.winnerUid !== 'string' || data.winnerUid.length === 0 || typeof data.winnerDetectedAt !== 'object' || data.winnerDetectedAt === null || !Number.isSafeInteger(data.winningTotalScore) || typeof data.winningScoreCommandId !== 'string')) {
        throw new Error('Invalid winner state.')
      }
      const reports = new Map(reportSnapshots.docs.map((report) => [report.id, report.data()]))
      const entries = (await Promise.all(sessionSnapshots.docs.map(async (member) => {
        const memberData = member.data()
        if (typeof memberData.displayName !== 'string') throw new Error('Invalid player state.')
        const entrySnapshots = await getDocs(collection(member.ref, 'scoreEntries'))
        return entrySnapshots.docs.map((entry): ScoreEntry => {
          const entryData = entry.data()
          if (!Number.isInteger(entryData.points) || entryData.points <= 0 || entryData.points % 5 !== 0 || !Number.isSafeInteger(entryData.sequence) || entryData.sequence < 1 || entryData.playerUid !== member.id) throw new Error('Invalid score entry.')
          const openReport = [...reports.entries()].find(([, report]) => report.status === 'open' && report.scoreOwnerUid === member.id && report.scoreEntryId === entry.id)
          if (openReport && (typeof openReport[1].reporterUid !== 'string' || typeof openReport[1].reason !== 'string' || (openReport[1].proposedPoints !== undefined && (!Number.isInteger(openReport[1].proposedPoints) || openReport[1].proposedPoints < 0 || openReport[1].proposedPoints % 5 !== 0)))) throw new Error('Invalid report state.')
          return { ownerUid: member.id, ownerDisplayName: memberData.displayName, entryId: entry.id, points: entryData.points, sequence: entryData.sequence, ...(openReport ? { openReport: { reportId: openReport[0], reporterUid: openReport[1].reporterUid, reason: openReport[1].reason, ...(openReport[1].proposedPoints === undefined ? {} : { proposedPoints: openReport[1].proposedPoints }) } } : {}) }
        })
      }))).flat()
      const orderedEntries = orderScoreEntries(entries, data.nextScoreSequence)
      const base = { sessionId, hostUid: data.hostUid, status: data.status, playerCount: data.playerCount, totalScore: player.totalScore, scoreEntries: orderedEntries }
      return hasWinner ? { ...base, winnerUid: data.winnerUid, winningTotalScore: data.winningTotalScore, winningScoreCommandId: data.winningScoreCommandId } : base
    } catch {
      throw new StartSessionError('unavailable')
    }
  }
}

export const firebaseSessionCreation = new FirebaseSessionService()
