import { httpsCallable, type Functions } from 'firebase/functions'
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore'

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
  ReopenGameError,
  type ReopenGameInput,
  type ReopenedGame,
  type SessionService,
  RecordScoreError,
  type RecordScoreInput,
  type RecordedScore,
  ReportScoreError,
  type ReportScoreInput,
  type ReportedScore,
  type ScoreEntry,
  type RecentSession,
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
type CallableReopenGameResult = ReopenedGame
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

function toReopenGameError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new ReopenGameError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new ReopenGameError('invalid-input')
  if (callableError?.code === 'functions/permission-denied') return new ReopenGameError('not-host')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details ? (callableError.details as { reason?: unknown }).reason : undefined
  if (reason === 'session-not-found' || reason === 'session-not-finished' || reason === 'idempotency-conflict') return new ReopenGameError(reason)
  return new ReopenGameError('unavailable')
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
  private readonly firestore: Firestore

  constructor(functions: Functions = firebaseFunctions, firestore: Firestore = firebaseFirestore) {
    this.functions = functions
    this.firestore = firestore
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

  async reopenGame(input: ReopenGameInput): Promise<ReopenedGame> {
    try { return (await httpsCallable<ReopenGameInput, CallableReopenGameResult>(this.functions, 'reopenGame')(input)).data } catch (error) { throw toReopenGameError(error) }
  }

  async preserveSession(sessionId: string): Promise<void> {
    await httpsCallable<{ sessionId: string }, { sessionId: string }>(this.functions, 'preserveSession')({ sessionId })
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
        getDocs(collection(this.firestore, 'sessions', sessionId, 'players')),
        getDocs(collection(this.firestore, 'sessions', sessionId, 'scoreReports')),
        getDocs(collection(this.firestore, 'sessions', sessionId, 'scoreReportResolutions')),
        getDocs(collection(this.firestore, 'sessions', sessionId, 'scoreCorrections')),
      ])
      const snapshot = await getDoc(doc(this.firestore, 'sessions', sessionId))
      const data = snapshot.data()
      const playerSnapshot = sessionSnapshots.docs.find((candidate) => candidate.id === playerUid)
      const player = playerSnapshot?.data()
      const winnerValues = [data?.winnerUid, data?.winnerDetectedAt, data?.winningTotalScore, data?.winningScoreCommandId]
      const hasWinner = winnerValues.every((value) => value !== undefined)
      if (!snapshot.exists() || !data || typeof data.code !== 'string' || !/^[2-9A-HJ-NP-Z]{6}$/.test(data.code) || typeof data.hostUid !== 'string' ||
        (data.status !== 'lobby' && data.status !== 'active' && data.status !== 'finished') ||
        !Number.isInteger(data.targetScore) || data.targetScore < 200 || data.targetScore > 1000 || data.targetScore % 5 !== 0 || !Number.isInteger(data.playerCount) ||
        !playerSnapshot || !player || !Number.isInteger(player.totalScore) || player.totalScore < 0) {
        throw new Error('Invalid session state.')
      }
      if (winnerValues.some((value) => value !== undefined) && (!hasWinner || typeof data.winnerUid !== 'string' || data.winnerUid.length === 0 || typeof data.winnerDetectedAt !== 'object' || data.winnerDetectedAt === null || !Number.isSafeInteger(data.winningTotalScore) || typeof data.winningScoreCommandId !== 'string')) {
        throw new Error('Invalid winner state.')
      }
      if (data.status === 'finished' && (!hasWinner || typeof data.finishedAt !== 'object' || data.finishedAt === null || typeof data.finalizationCommandId !== 'string')) throw new Error('Invalid finalization state.')
      if (data.status !== 'finished' && (data.finishedAt !== undefined || data.finalizationCommandId !== undefined)) throw new Error('Invalid active finalization state.')
      if (data.status === 'lobby' && hasWinner) throw new Error('Invalid lobby winner state.')
      const reports = new Map(reportSnapshots.docs.map((report) => [report.id, report.data()]))
      const resolutions = new Map(resolutionSnapshots.docs.map((resolution) => [resolution.id, resolution.data()]))
      const corrections: CorrectionRead[] = correctionSnapshots.docs.map((correction) => ({ id: correction.id, ...(correction.data() as Omit<CorrectionRead, 'id'>) }))
      const entries = (await Promise.all(sessionSnapshots.docs.map(async (member) => {
        const memberData = member.data()
        if (typeof memberData.displayName !== 'string' || !Number.isSafeInteger(memberData.totalScore) || memberData.totalScore < 0) throw new Error('Invalid player state.')
        const entrySnapshots = await getDocs(collection(member.ref, 'scoreEntries'))
        return entrySnapshots.docs.map((entry): ScoreEntry => {
          const entryData = entry.data()
          if (!Number.isInteger(entryData.points) || entryData.points <= 0 || entryData.points % 5 !== 0 || !Number.isSafeInteger(entryData.sequence) || entryData.sequence < 1 || entryData.playerUid !== member.id) throw new Error('Invalid score entry.')
          const entryCorrections = corrections.filter((correction) => correction.scoreOwnerUid === member.id && correction.scoreEntryId === entry.id)
          if (entryCorrections.some((correction) => !Number.isSafeInteger(correction.revision) || correction.revision < 1 || !Number.isSafeInteger(correction.correctedScore) || correction.correctedScore < 0 || correction.correctedScore % 5 !== 0) || entryCorrections.map((correction) => correction.revision).sort((a, b) => a - b).some((revision, index) => revision !== index + 1)) throw new Error('Invalid correction state.')
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
      const players = sessionSnapshots.docs.map((member) => ({ uid: member.id, displayName: member.data().displayName as string, totalScore: member.data().totalScore as number }))
      if (players.length !== data.playerCount || !players.some((member) => member.uid === data.hostUid) ||
        (hasWinner && (!players.some((member) => member.uid === data.winnerUid) || data.winningTotalScore < data.targetScore)) ||
        players.some((member) => orderedEntries.filter((entry) => entry.ownerUid === member.uid).reduce((total, entry) => total + (entry.effectivePoints ?? entry.points), 0) !== member.totalScore)) {
        throw new Error('Invalid player totals.')
      }
      const base = { sessionId, code: data.code, hostUid: data.hostUid, status: data.status, targetScore: data.targetScore, playerCount: data.playerCount, totalScore: player.totalScore, players, scoreEntries: orderedEntries }
      return hasWinner ? { ...base, winnerUid: data.winnerUid, winningTotalScore: data.winningTotalScore, winningScoreCommandId: data.winningScoreCommandId } : base
    } catch {
      throw new StartSessionError('unavailable')
    }
  }

  async listRecentSessions(playerUid: string): Promise<readonly RecentSession[]> {
    const history = await getDocs(query(collection(this.firestore, 'users', playerUid, 'sessions'), orderBy('updatedAt', 'desc'), limit(10)))
    const sessions = await Promise.all(history.docs.map(async (entry): Promise<RecentSession | undefined> => {
      const data = entry.data()
      if (typeof data.code !== 'string' || typeof data.displayName !== 'string' || (data.role !== 'host' && data.role !== 'player') ||
        !Number.isInteger(data.targetScore) || data.targetScore < 200 || data.targetScore > 1000 || data.targetScore % 5 !== 0) return undefined
      try {
        const current = await getDoc(doc(this.firestore, 'sessions', entry.id))
        const session = current.data()
        if (!current.exists() || !session || session.code !== data.code ||
          (session.status !== 'lobby' && session.status !== 'active' && session.status !== 'finished') || session.targetScore !== data.targetScore) return undefined
        return { sessionId: entry.id, code: data.code, displayName: data.displayName, role: data.role, targetScore: data.targetScore, status: session.status }
      } catch {
        return undefined
      }
    }))
    return sessions.filter((session): session is RecentSession => session !== undefined)
  }

  subscribeToSession(sessionId: string, playerUid: string, onSession: (session: CurrentSession) => void, onError: () => void): () => void {
    let closed = false
    let refreshing = false
    let refreshQueued = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let consecutiveFailures = 0
    const unsubscribers = new Set<() => void>()
    const scoreUnsubscribers = new Map<string, () => void>()

    const stop = () => {
      if (closed) return
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      for (const unsubscribe of unsubscribers) unsubscribe()
      for (const unsubscribe of scoreUnsubscribers.values()) unsubscribe()
      unsubscribers.clear()
      scoreUnsubscribers.clear()
    }
    const fail = () => { if (!closed) { onError(); stop() } }
    const refresh = () => {
      if (closed) return
      refreshQueued = true
      if (refreshing) return
      refreshing = true
      void (async () => {
        while (!closed && refreshQueued) {
          refreshQueued = false
          try {
            const session = await this.getSession(sessionId, playerUid)
            if (closed) return
            consecutiveFailures = 0
            onSession(session)
          } catch {
            consecutiveFailures += 1
            if (consecutiveFailures >= 3) onError()
            if (!closed && !retryTimer) retryTimer = setTimeout(() => { retryTimer = undefined; refresh() }, Math.min(250 * (2 ** consecutiveFailures), 4000))
          }
        }
        refreshing = false
      })()
    }
    const sessionReference = doc(this.firestore, 'sessions', sessionId)
    unsubscribers.add(onSnapshot(sessionReference, refresh, fail))
    unsubscribers.add(onSnapshot(collection(sessionReference, 'scoreReports'), refresh, fail))
    unsubscribers.add(onSnapshot(collection(sessionReference, 'scoreReportResolutions'), refresh, fail))
    unsubscribers.add(onSnapshot(collection(sessionReference, 'scoreCorrections'), refresh, fail))
    const unsubscribePlayers = onSnapshot(collection(sessionReference, 'players'), (snapshot) => {
      const currentIds = new Set(snapshot.docs.map((player) => player.id))
      for (const [uid, unsubscribe] of scoreUnsubscribers) {
        if (!currentIds.has(uid)) { unsubscribe(); scoreUnsubscribers.delete(uid) }
      }
      for (const player of snapshot.docs) {
        if (!scoreUnsubscribers.has(player.id)) {
          scoreUnsubscribers.set(player.id, onSnapshot(collection(player.ref, 'scoreEntries'), refresh, fail))
        }
      }
      refresh()
    }, fail)
    unsubscribers.add(unsubscribePlayers)
    return stop
  }
}

export const firebaseSessionCreation = new FirebaseSessionService()
