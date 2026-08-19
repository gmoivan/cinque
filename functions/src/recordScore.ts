import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { maxPlayers, validateSafeSessionId } from './sessionValidation.js'

export interface ValidRecordScoreInput {
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

type ScoreOutcome = 'session-not-active' | 'not-session-member' | 'idempotency-conflict'

function outcome(reason: ScoreOutcome): HttpsError {
  const code = reason === 'not-session-member' ? 'permission-denied' : 'failed-precondition'
  return new HttpsError(code, 'Score cannot be recorded.', { reason })
}

function unavailable(): HttpsError {
  return new HttpsError('unavailable', 'Score recording is temporarily unavailable.')
}

export function validateRecordScoreInput(input: unknown): ValidRecordScoreInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Invalid score input.')
  }
  const candidate = input as Record<string, unknown>
  if (Object.keys(candidate).length !== 3 || !('sessionId' in candidate) || !('points' in candidate) || !('commandId' in candidate)) {
    throw new HttpsError('invalid-argument', 'Invalid score input.')
  }
  if (typeof candidate.points !== 'number' || !Number.isFinite(candidate.points) || !Number.isInteger(candidate.points) || candidate.points <= 0 || candidate.points % 5 !== 0) {
    throw new HttpsError('invalid-argument', 'Invalid score input.')
  }
  if (typeof candidate.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.commandId)) {
    throw new HttpsError('invalid-argument', 'Invalid score input.')
  }
  return { sessionId: validateSafeSessionId(candidate.sessionId), points: candidate.points, commandId: candidate.commandId }
}

function isStoredTimestamp(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function'
}

function isCommandId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

type WinnerState = 'none' | 'detected' | 'invalid'

function winnerState(data: DocumentData, targetScore: number): WinnerState {
  const values = [data.winnerUid, data.winnerDetectedAt, data.winningScoreCommandId, data.winningTotalScore]
  if (values.every((value) => value === undefined)) return 'none'
  if (values.some((value) => value === undefined)) return 'invalid'
  return typeof data.winnerUid === 'string' && data.winnerUid.length > 0 &&
    isStoredTimestamp(data.winnerDetectedAt) && isCommandId(data.winningScoreCommandId) &&
    Number.isSafeInteger(data.winningTotalScore) && data.winningTotalScore >= targetScore
    ? 'detected'
    : 'invalid'
}

function validSession(data: DocumentData): boolean {
  return typeof data.hostUid === 'string' && data.hostUid.length > 0 &&
    data.status === 'active' &&
    Number.isInteger(data.targetScore) && data.targetScore >= 200 && data.targetScore <= 1000 && data.targetScore % 5 === 0 &&
    data.maxPlayers === maxPlayers && Number.isInteger(data.playerCount) && data.playerCount >= 2 && data.playerCount <= maxPlayers &&
    Array.isArray(data.playerNameKeys) && data.playerNameKeys.length === data.playerCount &&
    data.playerNameKeys.every((key) => typeof key === 'string' && key.length > 0) &&
    new Set(data.playerNameKeys).size === data.playerNameKeys.length &&
    winnerState(data, data.targetScore) !== 'invalid'
}

function validPlayer(data: DocumentData): data is { totalScore: number } {
  return typeof data.displayName === 'string' && data.displayName.length > 0 && Number.isInteger(data.totalScore) && data.totalScore >= 0
}

function validExistingEntry(data: DocumentData, uid: string, points: number): boolean {
  return data.playerUid === uid && data.points === points && Number.isInteger(data.points) && data.points > 0 && data.points % 5 === 0 && data.createdAt !== undefined
}

function result(sessionId: string, points: number, totalScore: number, commandId: string, session: DocumentData): RecordedScore {
  const currentWinnerState = winnerState(session, session.targetScore)
  return currentWinnerState === 'detected'
    ? { sessionId, points, totalScore, commandId, winnerUid: session.winnerUid, winningTotalScore: session.winningTotalScore, winningScoreCommandId: session.winningScoreCommandId }
    : { sessionId, points, totalScore, commandId }
}

export async function recordScoreRecord(firestore: Firestore, uid: string, input: ValidRecordScoreInput): Promise<RecordedScore> {
  return firestore.runTransaction(async (transaction) => {
    const sessionReference = firestore.collection('sessions').doc(input.sessionId)
    const playerReference = sessionReference.collection('players').doc(uid)
    const entryReference = playerReference.collection('scoreEntries').doc(input.commandId)
    const [sessionSnapshot, playerSnapshot, entrySnapshot] = await Promise.all([
      transaction.get(sessionReference), transaction.get(playerReference), transaction.get(entryReference),
    ])
    if (!sessionSnapshot.exists) throw outcome('session-not-active')
    const session = sessionSnapshot.data()
    if (!session) throw unavailable()
    if (session.status !== 'active') throw outcome('session-not-active')
    if (!validSession(session)) throw unavailable()
    if (!playerSnapshot.exists) throw outcome('not-session-member')
    const player = playerSnapshot.data()
    if (!player || !validPlayer(player)) throw unavailable()

    if (entrySnapshot.exists) {
      const entry = entrySnapshot.data()
      if (!entry || !validExistingEntry(entry, uid, input.points)) throw outcome('idempotency-conflict')
      return result(input.sessionId, input.points, player.totalScore, input.commandId, session)
    }

    const totalScore = player.totalScore + input.points
    if (!Number.isSafeInteger(totalScore) || totalScore < 0) throw unavailable()
    transaction.create(entryReference, { points: input.points, playerUid: uid, createdAt: FieldValue.serverTimestamp() })
    transaction.update(playerReference, { totalScore })
    if (winnerState(session, session.targetScore) === 'none' && totalScore >= session.targetScore) {
      transaction.update(sessionReference, {
        winnerUid: uid,
        winnerDetectedAt: FieldValue.serverTimestamp(),
        winningScoreCommandId: input.commandId,
        winningTotalScore: totalScore,
      })
      return { sessionId: input.sessionId, points: input.points, totalScore, commandId: input.commandId, winnerUid: uid, winningTotalScore: totalScore, winningScoreCommandId: input.commandId }
    }
    return result(input.sessionId, input.points, totalScore, input.commandId, session)
  })
}
