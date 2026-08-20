import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { createSessionRecord, validateCreateSessionInput } from './createSession.js'
import { finalizeGameRecord, validateFinalizeGameInput } from './finalizeGame.js'
import { initializeFirebaseAdmin } from './firebase.js'
import { joinSessionRecord, validateJoinSessionInput } from './joinSession.js'
import { recordScoreRecord, validateRecordScoreInput } from './recordScore.js'
import { reportScoreRecord, validateReportScoreInput } from './reportScore.js'
import { resolveScoreReportRecord, validateResolveScoreReportInput } from './resolveScoreReport.js'
import { startSessionRecord, validateStartSessionInput } from './startSession.js'

initializeFirebaseAdmin()

export const createSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateCreateSessionInput(request.data)
  return createSessionRecord(getFirestore(), request.auth.uid, input)
})

export const joinSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateJoinSessionInput(request.data)
  return joinSessionRecord(getFirestore(), request.auth.uid, input)
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
