import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { validateSafeSessionId } from './sessionValidation.js'

const commandIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maximumReasonLength = 280

export interface ValidReopenGameInput {
  readonly sessionId: string
  readonly reason: string
  readonly commandId: string
}

export interface ReopenedGame {
  readonly sessionId: string
  readonly status: 'active'
  readonly commandId: string
}

type ReopenOutcome = 'session-not-found' | 'session-not-finished' | 'not-host' | 'idempotency-conflict'

function failure(reason: ReopenOutcome): HttpsError {
  const code = reason === 'not-host' ? 'permission-denied' : 'failed-precondition'
  return new HttpsError(code, 'Game cannot be reopened.', { reason })
}

function unavailable(): HttpsError {
  return new HttpsError('unavailable', 'Game reopening is temporarily unavailable.')
}

function isTimestamp(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function'
}

function hasNoEffectiveResult(data: DocumentData): boolean {
  return [
    data.winnerUid,
    data.winnerDetectedAt,
    data.winningScoreCommandId,
    data.winningTotalScore,
    data.finalizationCommandId,
    data.finishedAt,
  ].every((value) => value === undefined)
}

function hasCompleteFinishedResult(data: DocumentData): boolean {
  return data.status === 'finished' &&
    typeof data.hostUid === 'string' && data.hostUid.length > 0 &&
    Number.isInteger(data.targetScore) && data.targetScore >= 200 && data.targetScore <= 1000 && data.targetScore % 5 === 0 &&
    Number.isSafeInteger(data.openScoreReportCount) && data.openScoreReportCount === 0 &&
    typeof data.winnerUid === 'string' && data.winnerUid.length > 0 &&
    isTimestamp(data.winnerDetectedAt) &&
    typeof data.winningScoreCommandId === 'string' && commandIdPattern.test(data.winningScoreCommandId) &&
    Number.isSafeInteger(data.winningTotalScore) && data.winningTotalScore >= data.targetScore &&
    typeof data.finalizationCommandId === 'string' && commandIdPattern.test(data.finalizationCommandId) &&
    isTimestamp(data.finishedAt)
}

function validReplay(event: DocumentData, session: DocumentData, uid: string, input: ValidReopenGameInput): boolean {
  return event.commandId === input.commandId && event.actorUid === uid && event.reason === input.reason &&
    event.previousStatus === 'finished' &&
    typeof event.previousWinnerUid === 'string' && event.previousWinnerUid.length > 0 &&
    isTimestamp(event.previousWinnerDetectedAt) &&
    typeof event.previousWinningScoreCommandId === 'string' && commandIdPattern.test(event.previousWinningScoreCommandId) &&
    Number.isSafeInteger(event.previousWinningTotalScore) &&
    typeof event.previousFinalizationCommandId === 'string' && commandIdPattern.test(event.previousFinalizationCommandId) &&
    isTimestamp(event.previousFinishedAt) && isTimestamp(event.createdAt) &&
    session.status === 'active' && session.hostUid === uid && session.lastReopenCommandId === input.commandId &&
    hasNoEffectiveResult(session)
}

export function validateReopenGameInput(input: unknown): ValidReopenGameInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Invalid game reopening.')
  }
  const data = input as Record<string, unknown>
  if (Object.keys(data).length !== 3 || typeof data.sessionId !== 'string' || typeof data.reason !== 'string' ||
    typeof data.commandId !== 'string' || !commandIdPattern.test(data.commandId)) {
    throw new HttpsError('invalid-argument', 'Invalid game reopening.')
  }
  const reason = data.reason.trim()
  if (Array.from(reason).length === 0 || Array.from(reason).length > maximumReasonLength ||
    /[\p{Cc}\p{Cf}]/u.test(reason) || !/\S/u.test(reason)) {
    throw new HttpsError('invalid-argument', 'Invalid game reopening.')
  }
  return { sessionId: validateSafeSessionId(data.sessionId), reason, commandId: data.commandId }
}

export async function reopenGameRecord(
  firestore: Firestore,
  uid: string,
  input: ValidReopenGameInput,
): Promise<ReopenedGame> {
  return firestore.runTransaction(async (transaction) => {
    const sessionReference = firestore.collection('sessions').doc(input.sessionId)
    const eventReference = sessionReference.collection('reopenEvents').doc(input.commandId)
    const openReportsQuery = sessionReference.collection('scoreReports').where('status', '==', 'open')
    const [sessionSnapshot, eventSnapshot, openReportsSnapshot] = await Promise.all([
      transaction.get(sessionReference),
      transaction.get(eventReference),
      transaction.get(openReportsQuery),
    ])

    if (!sessionSnapshot.exists) throw failure('session-not-found')
    const session = sessionSnapshot.data()
    if (!session || typeof session.hostUid !== 'string') throw unavailable()

    if (eventSnapshot.exists) {
      const event = eventSnapshot.data()
      if (!event || event.commandId !== input.commandId || event.actorUid !== uid || event.reason !== input.reason) {
        throw failure('idempotency-conflict')
      }
      if (!validReplay(event, session, uid, input) || openReportsSnapshot.size !== 0) throw unavailable()
      return { sessionId: input.sessionId, status: 'active', commandId: input.commandId }
    }

    if (session.hostUid !== uid) throw failure('not-host')
    if (session.status !== 'finished') throw failure('session-not-finished')
    if (!hasCompleteFinishedResult(session) || openReportsSnapshot.size !== session.openScoreReportCount) throw unavailable()

    transaction.create(eventReference, {
      commandId: input.commandId,
      actorUid: uid,
      reason: input.reason,
      previousStatus: 'finished',
      previousWinnerUid: session.winnerUid,
      previousWinnerDetectedAt: session.winnerDetectedAt,
      previousWinningScoreCommandId: session.winningScoreCommandId,
      previousWinningTotalScore: session.winningTotalScore,
      previousFinalizationCommandId: session.finalizationCommandId,
      previousFinishedAt: session.finishedAt,
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.update(sessionReference, {
      status: 'active',
      winnerUid: FieldValue.delete(),
      winnerDetectedAt: FieldValue.delete(),
      winningScoreCommandId: FieldValue.delete(),
      winningTotalScore: FieldValue.delete(),
      finalizationCommandId: FieldValue.delete(),
      finishedAt: FieldValue.delete(),
      lastReopenCommandId: input.commandId,
      reopenedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { sessionId: input.sessionId, status: 'active', commandId: input.commandId }
  })
}
