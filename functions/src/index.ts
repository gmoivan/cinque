import { getFirestore } from 'firebase-admin/firestore'
import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { createSessionRecord, validateCreateSessionInput } from './createSession.js'
import { finalizeGameRecord, validateFinalizeGameInput } from './finalizeGame.js'
import { initializeFirebaseAdmin } from './firebase.js'
import { joinSessionRecord, validateJoinSessionInput } from './joinSession.js'
import { recordScoreRecord, validateRecordScoreInput } from './recordScore.js'
import { cleanupExpiredSessionRecord, isPersistentSignInProvider, preserveSessionRecord, validatePreserveSessionInput } from './retention.js'
import { reportScoreRecord, validateReportScoreInput } from './reportScore.js'
import { reopenGameRecord, validateReopenGameInput } from './reopenGame.js'
import { resolveScoreReportRecord, validateResolveScoreReportInput } from './resolveScoreReport.js'
import { startSessionRecord, validateStartSessionInput } from './startSession.js'

initializeFirebaseAdmin()

export const createSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateCreateSessionInput(request.data)
  return createSessionRecord(getFirestore(), request.auth.uid, input, isPersistentSignInProvider(request.auth.token))
})

export const joinSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateJoinSessionInput(request.data)
  return joinSessionRecord(getFirestore(), request.auth.uid, input, isPersistentSignInProvider(request.auth.token))
})

export const preserveSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  if (!isPersistentSignInProvider(request.auth.token)) throw new HttpsError('failed-precondition', 'A persistent identity is required.')
  const input = validatePreserveSessionInput(request.data)
  await preserveSessionRecord(getFirestore(), request.auth.uid, input.sessionId)
  return { sessionId: input.sessionId, retentionKind: 'persistent' as const }
})

export const cleanupExpiredSession = onDocumentDeleted({ document: 'sessionExpirations/{sessionId}', retry: true }, async (event) => {
  await cleanupExpiredSessionRecord(getFirestore(), event.params.sessionId, event.data?.data())
})

export const startSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateStartSessionInput(request.data)
  return startSessionRecord(getFirestore(), request.auth.uid, input)
})

export const finalizeGame = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateFinalizeGameInput(request.data)
  return finalizeGameRecord(getFirestore(), request.auth.uid, input)
})

export const reopenGame = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateReopenGameInput(request.data)
  return reopenGameRecord(getFirestore(), request.auth.uid, input)
})

export const recordScore = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateRecordScoreInput(request.data)
  return recordScoreRecord(getFirestore(), request.auth.uid, input)
})

export const reportScore = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateReportScoreInput(request.data)
  return reportScoreRecord(getFirestore(), request.auth.uid, input)
})

export const resolveScoreReport = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateResolveScoreReportInput(request.data)
  return resolveScoreReportRecord(getFirestore(), request.auth.uid, input)
})
