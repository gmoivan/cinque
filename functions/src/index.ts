import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { createSessionRecord, validateCreateSessionInput } from './createSession.js'
import { initializeFirebaseAdmin } from './firebase.js'

initializeFirebaseAdmin()

export const createSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateCreateSessionInput(request.data)
  return createSessionRecord(getFirestore(), request.auth.uid, input)
})
