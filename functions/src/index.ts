import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { createSessionRecord, validateCreateSessionInput } from './createSession.js'
import { initializeFirebaseAdmin } from './firebase.js'
import { joinSessionRecord, validateJoinSessionInput } from './joinSession.js'
import { recordScoreRecord, validateRecordScoreInput } from './recordScore.js'
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

export const recordScore = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateRecordScoreInput(request.data)
  return recordScoreRecord(getFirestore(), request.auth.uid, input)
})
