import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { maxPlayers, normalizeDisplayName, validateDisplayName, validateSessionCode } from './sessionValidation.js'

export interface JoinSessionInput {
  readonly code: unknown
  readonly displayName: unknown
}

export interface ValidJoinSessionInput {
  readonly code: string
  readonly displayName: string
  readonly displayNameKey: string
}

export interface JoinedSession {
  readonly sessionId: string
  readonly code: string
  readonly status: string
  readonly targetScore: number
  readonly displayName: string
  readonly playerCount: number
}

function outcome(reason: 'session-not-found' | 'session-full' | 'display-name-taken' | 'session-not-joinable'): HttpsError {
  return new HttpsError('failed-precondition', 'Session cannot be joined.', { reason })
}

function unavailable(): HttpsError {
  return new HttpsError('unavailable', 'Session is temporarily unavailable.')
}

export function validateJoinSessionInput(input: unknown): ValidJoinSessionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Invalid join input.')
  }
  const candidate = input as Record<string, unknown>
  if (Object.keys(candidate).length !== 2 || !('code' in candidate) || !('displayName' in candidate)) {
    throw new HttpsError('invalid-argument', 'Invalid join input.')
  }
  const displayName = validateDisplayName(candidate.displayName)
  return { code: validateSessionCode(candidate.code), displayName, displayNameKey: normalizeDisplayName(displayName) }
}

function validSession(data: DocumentData): data is {
  hostUid: string
  status: string
  targetScore: number
  maxPlayers: number
  playerCount: number
  playerNameKeys: string[]
} {
  return typeof data.hostUid === 'string' &&
    typeof data.status === 'string' &&
    Number.isInteger(data.targetScore) &&
    data.targetScore >= 200 &&
    data.targetScore <= 1000 &&
    data.targetScore % 5 === 0 &&
    data.maxPlayers === maxPlayers &&
    Number.isInteger(data.playerCount) &&
    data.playerCount >= 1 &&
    data.playerCount <= maxPlayers &&
    Array.isArray(data.playerNameKeys) &&
    data.playerNameKeys.length === data.playerCount &&
    data.playerNameKeys.every((key) => typeof key === 'string' && key.length > 0) &&
    new Set(data.playerNameKeys).size === data.playerNameKeys.length
}

export async function joinSessionRecord(
  firestore: Firestore,
  uid: string,
  input: ValidJoinSessionInput,
): Promise<JoinedSession> {
  return firestore.runTransaction(async (transaction) => {
    const codeReference = firestore.collection('sessionCodes').doc(input.code)
    const codeSnapshot = await transaction.get(codeReference)
    const sessionId = codeSnapshot.data()?.sessionId
    if (!codeSnapshot.exists || typeof sessionId !== 'string' || !sessionId) throw outcome('session-not-found')

    const sessionReference = firestore.collection('sessions').doc(sessionId)
    const sessionSnapshot = await transaction.get(sessionReference)
    if (!sessionSnapshot.exists) throw outcome('session-not-found')
    const session = sessionSnapshot.data()
    if (!session || !validSession(session)) throw unavailable()

    const membershipReference = sessionReference.collection('players').doc(uid)
    const membershipSnapshot = await transaction.get(membershipReference)
    if (membershipSnapshot.exists) {
      const existingDisplayName = membershipSnapshot.data()?.displayName
      if (typeof existingDisplayName !== 'string') throw unavailable()
      return {
        sessionId,
        code: input.code,
        status: session.status,
        targetScore: session.targetScore,
        displayName: existingDisplayName,
        playerCount: session.playerCount,
      }
    }

    if (session.status !== 'lobby') throw outcome('session-not-joinable')
    if (session.playerCount >= maxPlayers) throw outcome('session-full')
    if (session.playerNameKeys.includes(input.displayNameKey)) throw outcome('display-name-taken')

    transaction.create(membershipReference, {
      displayName: input.displayName,
      joinedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(sessionReference, {
      playerCount: session.playerCount + 1,
      playerNameKeys: [...session.playerNameKeys, input.displayNameKey],
      updatedAt: FieldValue.serverTimestamp(),
    })
    return {
      sessionId,
      code: input.code,
      status: 'lobby',
      targetScore: session.targetScore,
      displayName: input.displayName,
      playerCount: session.playerCount + 1,
    }
  })
}
