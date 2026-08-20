import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { isValidScoreValue } from './recordScore.js'
import { validateSafeSessionId } from './sessionValidation.js'

const commandIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maximumReasonLength = 280

export interface ValidReportScoreInput {
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

type ReportOutcome = 'not-session-member' | 'score-not-found' | 'cannot-report-own-score' | 'open-report-exists' | 'session-finalized' | 'idempotency-conflict'

function outcome(reason: ReportOutcome): HttpsError {
  return new HttpsError(reason === 'not-session-member' || reason === 'cannot-report-own-score' ? 'permission-denied' : 'failed-precondition', 'Score cannot be reported.', { reason })
}

function unavailable(): HttpsError {
  return new HttpsError('unavailable', 'Score reporting is temporarily unavailable.')
}

function validateUid(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'Invalid report input.')
  return value
}

function validateCommandId(value: unknown): string {
  if (typeof value !== 'string' || !commandIdPattern.test(value)) throw new HttpsError('invalid-argument', 'Invalid report input.')
  return value
}

function validateReason(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Invalid report input.')
  const reason = value.trim()
  if (Array.from(reason).length === 0 || Array.from(reason).length > maximumReasonLength || /[\p{Cc}\p{Cf}]/u.test(reason) || !/\S/u.test(reason)) {
    throw new HttpsError('invalid-argument', 'Invalid report input.')
  }
  return reason
}

export function validateReportScoreInput(input: unknown): ValidReportScoreInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Invalid report input.')
  const candidate = input as Record<string, unknown>
  const allowedKeys = ['sessionId', 'scoreOwnerUid', 'scoreEntryId', 'reason', 'proposedPoints', 'commandId']
  if (!Object.keys(candidate).every((key) => allowedKeys.includes(key)) || Object.keys(candidate).length < 5 ||
    !('sessionId' in candidate) || !('scoreOwnerUid' in candidate) || !('scoreEntryId' in candidate) || !('reason' in candidate) || !('commandId' in candidate)) {
    throw new HttpsError('invalid-argument', 'Invalid report input.')
  }
  if ('proposedPoints' in candidate && !isValidScoreValue(candidate.proposedPoints, true)) throw new HttpsError('invalid-argument', 'Invalid report input.')
  return {
    sessionId: validateSafeSessionId(candidate.sessionId), scoreOwnerUid: validateUid(candidate.scoreOwnerUid), scoreEntryId: validateCommandId(candidate.scoreEntryId),
    reason: validateReason(candidate.reason), ...(candidate.proposedPoints === undefined ? {} : { proposedPoints: candidate.proposedPoints as number }), commandId: validateCommandId(candidate.commandId),
  }
}

function validSession(data: DocumentData): boolean {
  return typeof data.hostUid === 'string' && data.hostUid.length > 0 && Number.isSafeInteger(data.nextScoreSequence) && data.nextScoreSequence >= 1 &&
    Number.isSafeInteger(data.openScoreReportCount) && data.openScoreReportCount >= 0 &&
    (data.status === 'active' || data.status === 'finished')
}

function validEntry(data: DocumentData, ownerUid: string): boolean {
  return data.playerUid === ownerUid && isValidScoreValue(data.points) && Number.isSafeInteger(data.sequence) && data.sequence >= 1 && data.createdAt !== undefined
}

function validExistingReport(data: DocumentData, uid: string, input: ValidReportScoreInput): boolean {
  return data.commandId === input.commandId && data.reporterUid === uid && data.scoreOwnerUid === input.scoreOwnerUid && data.scoreEntryId === input.scoreEntryId && data.reason === input.reason &&
    data.proposedPoints === input.proposedPoints && (data.status === 'open' || (data.status === 'resolved' && typeof data.resolutionCommandId === 'string')) && data.createdAt !== undefined
}

function validOpenReportLock(data: DocumentData, input: ValidReportScoreInput): boolean {
  return data.reportId === input.commandId && data.scoreOwnerUid === input.scoreOwnerUid && data.scoreEntryId === input.scoreEntryId && data.createdAt !== undefined
}

export async function reportScoreRecord(firestore: Firestore, uid: string, input: ValidReportScoreInput): Promise<ReportedScore> {
  return firestore.runTransaction(async (transaction) => {
    const sessionReference = firestore.collection('sessions').doc(input.sessionId)
    const reporterReference = sessionReference.collection('players').doc(uid)
    const entryReference = sessionReference.collection('players').doc(input.scoreOwnerUid).collection('scoreEntries').doc(input.scoreEntryId)
    const reportReference = sessionReference.collection('scoreReports').doc(input.commandId)
    const openReference = sessionReference.collection('openScoreReports').doc(`${input.scoreOwnerUid}_${input.scoreEntryId}`)
    const openReportsQuery = sessionReference.collection('scoreReports').where('status', '==', 'open').where('scoreOwnerUid', '==', input.scoreOwnerUid).where('scoreEntryId', '==', input.scoreEntryId)
    const [sessionSnapshot, reporterSnapshot, entrySnapshot, reportSnapshot, openSnapshot, openReportsSnapshot] = await Promise.all([
      transaction.get(sessionReference), transaction.get(reporterReference), transaction.get(entryReference), transaction.get(reportReference), transaction.get(openReference), transaction.get(openReportsQuery),
    ])
    if (!sessionSnapshot.exists || !sessionSnapshot.data() || !validSession(sessionSnapshot.data()!)) throw unavailable()
    if (!reporterSnapshot.exists) throw outcome('not-session-member')
    if (!entrySnapshot.exists || !entrySnapshot.data() || !validEntry(entrySnapshot.data()!, input.scoreOwnerUid)) throw outcome('score-not-found')
    if (uid === input.scoreOwnerUid) throw outcome('cannot-report-own-score')
    if (reportSnapshot.exists) {
      const report = reportSnapshot.data()
      if (!report || !validExistingReport(report, uid, input)) throw outcome('idempotency-conflict')
      if (report.status === 'resolved') {
        return { sessionId: input.sessionId, scoreOwnerUid: input.scoreOwnerUid, scoreEntryId: input.scoreEntryId, commandId: input.commandId, status: 'open' }
      }
      if (!openSnapshot.exists || !openSnapshot.data() || !validOpenReportLock(openSnapshot.data()!, input) || openReportsSnapshot.docs.length !== 1 || openReportsSnapshot.docs[0].id !== input.commandId) throw unavailable()
      return { sessionId: input.sessionId, scoreOwnerUid: input.scoreOwnerUid, scoreEntryId: input.scoreEntryId, commandId: input.commandId, status: 'open' }
    }
    if (sessionSnapshot.data()!.status === 'finished') throw outcome('session-finalized')
    if (openReportsSnapshot.docs.length > 0) {
      const canonical = openReportsSnapshot.docs.length === 1 && openSnapshot.exists && openSnapshot.data() &&
        openSnapshot.data()!.reportId === openReportsSnapshot.docs[0].id && openSnapshot.data()!.scoreOwnerUid === input.scoreOwnerUid && openSnapshot.data()!.scoreEntryId === input.scoreEntryId
      if (!canonical) throw unavailable()
      throw outcome('open-report-exists')
    }
    if (openSnapshot.exists) throw unavailable()
    const report = { scoreOwnerUid: input.scoreOwnerUid, scoreEntryId: input.scoreEntryId, reporterUid: uid, reason: input.reason, status: 'open' as const, commandId: input.commandId, createdAt: FieldValue.serverTimestamp(), ...(input.proposedPoints === undefined ? {} : { proposedPoints: input.proposedPoints }) }
    transaction.create(reportReference, report)
    transaction.create(openReference, { reportId: input.commandId, scoreOwnerUid: input.scoreOwnerUid, scoreEntryId: input.scoreEntryId, createdAt: FieldValue.serverTimestamp() })
    transaction.update(sessionReference, { openScoreReportCount: sessionSnapshot.data()!.openScoreReportCount + 1 })
    return { sessionId: input.sessionId, scoreOwnerUid: input.scoreOwnerUid, scoreEntryId: input.scoreEntryId, commandId: input.commandId, status: 'open' }
  })
}
