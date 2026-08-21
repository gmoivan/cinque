import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { projectID } from 'firebase-functions/params'
import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'

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

const callableOptions = {
  enforceAppCheck: projectID.equals('demo-cinque').thenElse(false, true),
}

type CallableHandler = (request: CallableRequest<unknown>) => unknown

function defineCallable(functionName: string, handler: CallableHandler) {
  return onCall(callableOptions, async (request) => {
    try {
      return await handler(request)
    } catch (error) {
      const code = error instanceof HttpsError ? error.code : 'internal'
      const context = {
        event: 'callable_failed',
        functionName,
        code,
        authenticated: Boolean(request.auth),
        appCheckVerified: Boolean(request.app),
      }
      if (code === 'internal' || code === 'unavailable') logger.error('Callable failed.', context)
      else logger.warn('Callable rejected.', context)
      throw error
    }
  })
}

export const createSession = defineCallable('createSession', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateCreateSessionInput(request.data)
  return createSessionRecord(getFirestore(), request.auth.uid, input, isPersistentSignInProvider(request.auth.token))
})

export const joinSession = defineCallable('joinSession', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateJoinSessionInput(request.data)
  return joinSessionRecord(getFirestore(), request.auth.uid, input, isPersistentSignInProvider(request.auth.token))
})

export const preserveSession = defineCallable('preserveSession', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  if (!isPersistentSignInProvider(request.auth.token)) throw new HttpsError('failed-precondition', 'A persistent identity is required.')
  const input = validatePreserveSessionInput(request.data)
  await preserveSessionRecord(getFirestore(), request.auth.uid, input.sessionId)
  return { sessionId: input.sessionId, retentionKind: 'persistent' as const }
})

export const cleanupExpiredSession = onDocumentDeleted({ document: 'sessionExpirations/{sessionId}', retry: true }, async (event) => {
  try {
    const outcome = await cleanupExpiredSessionRecord(getFirestore(), event.params.sessionId, event.data?.data())
    logger.info('TTL cleanup completed.', { event: 'ttl_cleanup_completed', eventId: event.id, outcome })
  } catch (error) {
    logger.error('TTL cleanup failed.', {
      event: 'ttl_cleanup_failed',
      eventId: event.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    throw error
  }
})

export const startSession = defineCallable('startSession', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateStartSessionInput(request.data)
  return startSessionRecord(getFirestore(), request.auth.uid, input)
})

export const finalizeGame = defineCallable('finalizeGame', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateFinalizeGameInput(request.data)
  return finalizeGameRecord(getFirestore(), request.auth.uid, input)
})

export const reopenGame = defineCallable('reopenGame', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateReopenGameInput(request.data)
  return reopenGameRecord(getFirestore(), request.auth.uid, input)
})

export const recordScore = defineCallable('recordScore', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateRecordScoreInput(request.data)
  return recordScoreRecord(getFirestore(), request.auth.uid, input)
})

export const reportScore = defineCallable('reportScore', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateReportScoreInput(request.data)
  return reportScoreRecord(getFirestore(), request.auth.uid, input)
})

export const resolveScoreReport = defineCallable('resolveScoreReport', async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const input = validateResolveScoreReportInput(request.data)
  return resolveScoreReportRecord(getFirestore(), request.auth.uid, input)
})
