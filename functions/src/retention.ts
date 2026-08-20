import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { validateSafeSessionId } from './sessionValidation.js'

export const anonymousSessionRetentionDays = 30
const retentionMilliseconds = anonymousSessionRetentionDays * 24 * 60 * 60 * 1000

export function isPersistentSignInProvider(token: unknown): boolean {
  if (!token || typeof token !== 'object') return false
  const firebase = (token as { firebase?: unknown }).firebase
  if (!firebase || typeof firebase !== 'object') return false
  const provider = (firebase as { sign_in_provider?: unknown }).sign_in_provider
  return typeof provider === 'string' && provider !== 'anonymous'
}

export function anonymousSessionExpiration(now = Date.now()): Timestamp {
  return Timestamp.fromMillis(now + retentionMilliseconds)
}

export function validatePreserveSessionInput(input: unknown): { sessionId: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('sessionId' in input)) {
    throw new HttpsError('invalid-argument', 'Invalid session preservation.')
  }
  return { sessionId: validateSafeSessionId((input as { sessionId: unknown }).sessionId) }
}

export async function preserveSessionRecord(firestore: Firestore, uid: string, sessionId: string): Promise<void> {
  await firestore.runTransaction(async (transaction) => {
    const sessionReference = firestore.collection('sessions').doc(sessionId)
    const membershipReference = sessionReference.collection('players').doc(uid)
    const expirationReference = firestore.collection('sessionExpirations').doc(sessionId)
    const [sessionSnapshot, membershipSnapshot, expirationSnapshot] = await Promise.all([
      transaction.get(sessionReference),
      transaction.get(membershipReference),
      transaction.get(expirationReference),
    ])
    if (!sessionSnapshot.exists || !membershipSnapshot.exists) throw new HttpsError('permission-denied', 'Permission denied.')
    const session = sessionSnapshot.data()
    if (!session || (session.retentionKind !== 'anonymous' && session.retentionKind !== 'persistent')) {
      throw new HttpsError('unavailable', 'Session preservation is temporarily unavailable.')
    }
    if (session.retentionKind === 'persistent') {
      if (session.expiresAt !== undefined || expirationSnapshot.exists) throw new HttpsError('unavailable', 'Session preservation is temporarily unavailable.')
      return
    }
    if (!isTimestamp(session.expiresAt) || !expirationSnapshot.exists || !sameTimestamp(expirationSnapshot.data()?.expiresAt, session.expiresAt)) {
      throw new HttpsError('unavailable', 'Session preservation is temporarily unavailable.')
    }
    transaction.update(sessionReference, {
      retentionKind: 'persistent',
      expiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.delete(expirationReference)
  })
}

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp || (typeof value === 'object' && value !== null && 'toMillis' in value && typeof value.toMillis === 'function')
}

function sameTimestamp(left: unknown, right: unknown): boolean {
  return isTimestamp(left) && isTimestamp(right) && left.toMillis() === right.toMillis()
}

export function hasValidAnonymousRetentionMarker(
  sessionId: string,
  code: string,
  expiresAt: unknown,
  marker: DocumentData | undefined,
): boolean {
  return isTimestamp(expiresAt) && marker?.sessionId === sessionId && marker.code === code && sameTimestamp(marker.expiresAt, expiresAt)
}

export async function cleanupExpiredSessionRecord(
  firestore: Firestore,
  sessionId: string,
  deletedMarker: DocumentData | undefined,
  now = Date.now(),
): Promise<'deleted' | 'preserved' | 'restored' | 'missing'> {
  const sessionReference = firestore.collection('sessions').doc(sessionId)
  const sessionSnapshot = await sessionReference.get()
  if (!sessionSnapshot.exists) return 'missing'
  const session = sessionSnapshot.data()
  if (!session || (session.retentionKind !== 'anonymous' && session.retentionKind !== 'persistent')) {
    throw new Error('Invalid session retention state.')
  }
  if (session.retentionKind === 'persistent') {
    if (session.expiresAt !== undefined) throw new Error('Invalid persistent session retention state.')
    return 'preserved'
  }
  if (typeof session.code !== 'string' || session.code.length !== 6 ||
    !hasValidAnonymousRetentionMarker(sessionId, session.code, session.expiresAt, deletedMarker)) {
    throw new Error('Invalid anonymous session retention state.')
  }
  if (session.expiresAt.toMillis() > now) {
    await firestore.collection('sessionExpirations').doc(sessionId).set({
      sessionId,
      code: session.code,
      expiresAt: session.expiresAt,
    })
    return 'restored'
  }
  const playersSnapshot = await sessionReference.collection('players').get()
  const batch = firestore.batch()
  batch.delete(firestore.collection('sessionCodes').doc(session.code))
  for (const player of playersSnapshot.docs) {
    batch.delete(firestore.collection('users').doc(player.id).collection('sessions').doc(sessionId))
  }
  await batch.commit()
  await firestore.recursiveDelete(sessionReference)
  return 'deleted'
}
