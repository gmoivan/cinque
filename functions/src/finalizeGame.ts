import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { validateSafeSessionId } from './sessionValidation.js'

const commandIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ValidFinalizeGameInput { readonly sessionId: string; readonly commandId: string }
export interface FinalizedGame { readonly sessionId: string; readonly status: 'finished'; readonly commandId: string; readonly winnerUid: string; readonly winningTotalScore: number; readonly winningScoreCommandId: string }
type FinalizeOutcome = 'session-not-found' | 'no-winner-detected' | 'open-score-reports' | 'session-finalized' | 'idempotency-conflict'

function failure(reason: FinalizeOutcome): HttpsError { return new HttpsError('failed-precondition', 'Game cannot be finalized.', { reason }) }
function unavailable(): HttpsError { return new HttpsError('unavailable', 'Game finalization is temporarily unavailable.') }
function timestamp(value: unknown): boolean { return typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function' }
function winnerState(data: DocumentData): 'none' | 'detected' | 'invalid' { const values = [data.winnerUid, data.winnerDetectedAt, data.winningScoreCommandId, data.winningTotalScore]; if (values.every((value) => value === undefined)) return 'none'; if (values.some((value) => value === undefined)) return 'invalid'; return typeof data.winnerUid === 'string' && data.winnerUid.length > 0 && timestamp(data.winnerDetectedAt) && typeof data.winningScoreCommandId === 'string' && commandIdPattern.test(data.winningScoreCommandId) && Number.isSafeInteger(data.winningTotalScore) && data.winningTotalScore >= data.targetScore ? 'detected' : 'invalid' }
function validSession(data: DocumentData): boolean { const winner = winnerState(data); return typeof data.hostUid === 'string' && data.hostUid.length > 0 && Number.isInteger(data.targetScore) && data.targetScore >= 200 && data.targetScore <= 1000 && data.targetScore % 5 === 0 && Number.isSafeInteger(data.nextScoreSequence) && data.nextScoreSequence >= 1 && Number.isSafeInteger(data.openScoreReportCount) && data.openScoreReportCount >= 0 && ((data.status === 'active' && (winner === 'none' || winner === 'detected')) || (data.status === 'finished' && winner === 'detected')) }

export function validateFinalizeGameInput(input: unknown): ValidFinalizeGameInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Invalid game finalization.')
  const data = input as Record<string, unknown>
  if (Object.keys(data).length !== 2 || typeof data.sessionId !== 'string' || typeof data.commandId !== 'string' || !commandIdPattern.test(data.commandId)) throw new HttpsError('invalid-argument', 'Invalid game finalization.')
  return { sessionId: validateSafeSessionId(data.sessionId), commandId: data.commandId }
}

function result(sessionId: string, commandId: string, session: DocumentData): FinalizedGame { return { sessionId, status: 'finished', commandId, winnerUid: session.winnerUid, winningTotalScore: session.winningTotalScore, winningScoreCommandId: session.winningScoreCommandId } }

export async function finalizeGameRecord(firestore: Firestore, uid: string, input: ValidFinalizeGameInput): Promise<FinalizedGame> {
  return firestore.runTransaction(async (transaction) => {
    const sessionRef = firestore.collection('sessions').doc(input.sessionId)
    const openReportsQuery = sessionRef.collection('scoreReports').where('status', '==', 'open')
    const [snapshot, openReportsSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(openReportsQuery)])
    if (!snapshot.exists) throw failure('session-not-found')
    const session = snapshot.data()
    if (!session || !validSession(session)) throw unavailable()
    if (openReportsSnapshot.size !== session.openScoreReportCount) throw unavailable()
    if (session.hostUid !== uid) throw new HttpsError('permission-denied', 'Permission denied.')
    if (session.status === 'finished') {
      if (session.finalizationCommandId === input.commandId && timestamp(session.finishedAt)) return result(input.sessionId, input.commandId, session)
      throw failure('session-finalized')
    }
    if (winnerState(session) !== 'detected') throw failure('no-winner-detected')
    if (session.openScoreReportCount !== 0) throw failure('open-score-reports')
    transaction.update(sessionRef, { status: 'finished', finalizationCommandId: input.commandId, finishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    return result(input.sessionId, input.commandId, session)
  })
}
