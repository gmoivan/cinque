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
  FinalizeGameError,
  type FinalizeGameInput,
  type FinalizedGame,
  type SessionService,
  RecordScoreError,
  type RecordScoreInput,
  type RecordedScore,
  ReportScoreError,
  type ReportScoreInput,
  type ReportedScore,
  type ScoreEntry,
  ResolveScoreReportError,
  type ResolveScoreReportInput,
  type ResolvedScoreReport,
} from '../../application/sessions'

import { firebaseFirestore, firebaseFunctions } from './config'
import { orderScoreEntries } from './scoreOrdering'

type CallableCreateSessionResult = CreatedSession
type CallableJoinSessionResult = JoinedSession
type CallableStartSessionResult = StartedSession
type CallableFinalizeGameResult = FinalizedGame
type CallableRecordScoreResult = RecordedScore
type CallableReportScoreResult = ReportedScore
type CallableResolveScoreReportResult = ResolvedScoreReport
interface CorrectionRead { readonly id: string; readonly scoreOwnerUid: string; readonly scoreEntryId: string; readonly revision: number; readonly correctedScore: number }

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
function toFinalizeGameError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new FinalizeGameError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new FinalizeGameError('invalid-input')
  if (callableError?.code === 'functions/permission-denied') return new FinalizeGameError('not-host')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details ? (callableError.details as { reason?: unknown }).reason : undefined
  if (reason === 'session-not-found' || reason === 'no-winner-detected' || reason === 'open-score-reports' || reason === 'session-finalized' || reason === 'idempotency-conflict') return new FinalizeGameError(reason)
  return new FinalizeGameError('unavailable')
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
  if (reason === 'not-session-member' || reason === 'score-not-found' || reason === 'cannot-report-own-score' || reason === 'open-report-exists' || reason === 'session-finalized' || reason === 'idempotency-conflict') return new ReportScoreError(reason)
  return new ReportScoreError('unavailable')
}
function toResolveScoreReportError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new ResolveScoreReportError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new ResolveScoreReportError('invalid-input')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details ? (callableError.details as { reason?: unknown }).reason : undefined
  if (reason === 'not-session-member' || reason === 'report-not-found' || reason === 'not-score-owner' || reason === 'session-finalized' || reason === 'already-resolved' || reason === 'idempotency-conflict') return new ResolveScoreReportError(reason)
  return new ResolveScoreReportError('unavailable')
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

  async finalizeGame(input: FinalizeGameInput): Promise<FinalizedGame> {
    try { return (await httpsCallable<FinalizeGameInput, CallableFinalizeGameResult>(this.functions, 'finalizeGame')(input)).data } catch (error) { throw toFinalizeGameError(error) }
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

  async resolveScoreReport(input: ResolveScoreReportInput): Promise<ResolvedScoreReport> {
    try { return (await httpsCallable<ResolveScoreReportInput, CallableResolveScoreReportResult>(this.functions, 'resolveScoreReport')(input)).data } catch (error) { throw toResolveScoreReportError(error) }
  }

  async getSession(sessionId: string, playerUid: string): Promise<CurrentSession> {
    try {
      const [sessionSnapshots, reportSnapshots, resolutionSnapshots, correctionSnapshots] = await Promise.all([
        getDocs(collection(firebaseFirestore, 'sessions', sessionId, 'players')),
        getDocs(collection(firebaseFirestore, 'sessions', sessionId, 'scoreReports')),
        getDocs(collection(firebaseFirestore, 'sessions', sessionId, 'scoreReportResolutions')),
        getDocs(collection(firebaseFirestore, 'sessions', sessionId, 'scoreCorrections')),
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
      const resolutions = new Map(resolutionSnapshots.docs.map((resolution) => [resolution.id, resolution.data()]))
      const corrections: CorrectionRead[] = correctionSnapshots.docs.map((correction) => ({ id: correction.id, ...(correction.data() as Omit<CorrectionRead, 'id'>) }))
      const entries = (await Promise.all(sessionSnapshots.docs.map(async (member) => {
        const memberData = member.data()
        if (typeof memberData.displayName !== 'string') throw new Error('Invalid player state.')
        const entrySnapshots = await getDocs(collection(member.ref, 'scoreEntries'))
        return entrySnapshots.docs.map((entry): ScoreEntry => {
          const entryData = entry.data()
          if (!Number.isInteger(entryData.points) || entryData.points <= 0 || entryData.points % 5 !== 0 || !Number.isSafeInteger(entryData.sequence) || entryData.sequence < 1 || entryData.playerUid !== member.id) throw new Error('Invalid score entry.')
          const entryCorrections = corrections.filter((correction) => correction.scoreOwnerUid === member.id && correction.scoreEntryId === entry.id)
          if (entryCorrections.some((correction) => !Number.isInteger(correction.revision) || correction.revision < 1 || !Number.isInteger(correction.correctedScore) || correction.correctedScore < 0 || correction.correctedScore % 5 !== 0) || entryCorrections.map((correction) => correction.revision).sort((a, b) => a - b).some((revision, index) => revision !== index + 1)) throw new Error('Invalid correction state.')
          const latest = entryCorrections.sort((a, b) => b.revision - a.revision)[0]
          const entryReports = [...reports.entries()].filter(([, report]) => report.scoreOwnerUid === member.id && report.scoreEntryId === entry.id).map(([reportId, report]) => {
            if ((report.status !== 'open' && report.status !== 'resolved') || typeof report.reporterUid !== 'string' || typeof report.reason !== 'string') throw new Error('Invalid report state.')
            const resolution = report.status === 'resolved' ? resolutions.get(report.resolutionCommandId) : undefined
            if (report.status === 'resolved' && (!resolution || (resolution.outcome !== 'accepted' && resolution.outcome !== 'rejected'))) throw new Error('Invalid resolution state.')
            return { reportId, reporterUid: report.reporterUid, reason: report.reason, ...(report.proposedPoints === undefined ? {} : { proposedPoints: report.proposedPoints }), status: report.status, ...(resolution ? { outcome: resolution.outcome, ...(resolution.reason === undefined ? {} : { resolutionReason: resolution.reason }) } : {}) } as const
          })
          const effectivePoints = latest ? latest.correctedScore : entryData.points
          return { ownerUid: member.id, ownerDisplayName: memberData.displayName, entryId: entry.id, points: effectivePoints, originalPoints: entryData.points, effectivePoints, isCorrected: !!latest, sequence: entryData.sequence, reports: entryReports }
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
