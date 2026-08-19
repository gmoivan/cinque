import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { maxPlayers } from './sessionValidation.js'

export interface ValidStartSessionInput {
  readonly sessionId: string
}

export interface StartedSession {
  readonly sessionId: string
  readonly status: 'active'
  readonly playerCount: number
}

function outcome(reason: 'session-not-found' | 'not-enough-players' | 'session-not-startable'): HttpsError {
  return new HttpsError('failed-precondition', 'Session cannot be started.', { reason })
}

function unavailable(): HttpsError {
  return new HttpsError('unavailable', 'Session is temporarily unavailable.')
}

export function validateStartSessionInput(input: unknown): ValidStartSessionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Invalid start input.')
  }
  const candidate = input as Record<string, unknown>
  if (Object.keys(candidate).length !== 1 || !('sessionId' in candidate) || typeof candidate.sessionId !== 'string') {
    throw new HttpsError('invalid-argument', 'Invalid start input.')
  }
  const sessionId = candidate.sessionId.trim()
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    throw new HttpsError('invalid-argument', 'Invalid session input.')
  }
  return { sessionId }
}

function validSession(data: DocumentData): data is {
  hostUid: string
  status: string
  maxPlayers: number
  playerCount: number
  playerNameKeys: string[]
} {
  return typeof data.hostUid === 'string' &&
    data.hostUid.length > 0 &&
    typeof data.status === 'string' &&
    data.maxPlayers === maxPlayers &&
    Number.isInteger(data.playerCount) &&
    data.playerCount >= 1 &&
    Array.isArray(data.playerNameKeys) &&
    data.playerNameKeys.length === data.playerCount &&
    data.playerNameKeys.every((key) => typeof key === 'string' && key.length > 0) &&
    new Set(data.playerNameKeys).size === data.playerNameKeys.length
}

export async function startSessionRecord(
  firestore: Firestore,
  uid: string,
  input: ValidStartSessionInput,
): Promise<StartedSession> {
  return firestore.runTransaction(async (transaction) => {
    const sessionReference = firestore.collection('sessions').doc(input.sessionId)
    const sessionSnapshot = await transaction.get(sessionReference)
    if (!sessionSnapshot.exists) throw outcome('session-not-found')
    const session = sessionSnapshot.data()
    if (!session || !validSession(session)) throw unavailable()
    if (session.hostUid !== uid) throw new HttpsError('permission-denied', 'Permission denied.')
    if (session.status === 'active') {
      return { sessionId: input.sessionId, status: 'active', playerCount: session.playerCount }
    }
    if (session.status !== 'lobby') throw outcome('session-not-startable')
    if (session.playerCount < 2) throw outcome('not-enough-players')
    if (session.playerCount > maxPlayers) throw unavailable()

    transaction.update(sessionReference, {
      status: 'active',
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { sessionId: input.sessionId, status: 'active', playerCount: session.playerCount }
  })
}
