import { randomInt } from 'node:crypto'

import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { maxPlayers, normalizeDisplayName, sessionCodeAlphabet, sessionCodeLength, validateDisplayName } from './sessionValidation.js'
import { anonymousSessionExpiration } from './retention.js'

export { maxPlayers, normalizeDisplayName, sessionCodeAlphabet, sessionCodeLength } from './sessionValidation.js'
export const maxCodeAllocationAttempts = 8

export interface CreateSessionInput {
  readonly displayName: unknown
  readonly targetScore: unknown
}

export interface ValidCreateSessionInput {
  readonly displayName: string
  readonly targetScore: number
}

export interface CreateSessionResult {
  readonly sessionId: string
  readonly code: string
  readonly status: 'lobby'
  readonly targetScore: number
}

export function validateCreateSessionInput(input: unknown): ValidCreateSessionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Invalid session input.')
  }
  const candidate = input as Record<string, unknown>
  if (Object.keys(candidate).length !== 2 || !('displayName' in candidate) || !('targetScore' in candidate)) {
    throw new HttpsError('invalid-argument', 'Invalid session input.')
  }
  const displayName = validateDisplayName(candidate.displayName)
  if (
    typeof candidate.targetScore !== 'number' ||
    !Number.isInteger(candidate.targetScore) ||
    candidate.targetScore < 200 ||
    candidate.targetScore > 1000 ||
    candidate.targetScore % 5 !== 0
  ) {
    throw new HttpsError('invalid-argument', 'Invalid target score.')
  }
  return { displayName, targetScore: candidate.targetScore }
}

export function generateSessionCode(random: (max: number) => number = (max) => randomInt(max)) {
  return Array.from({ length: sessionCodeLength }, () => sessionCodeAlphabet[random(sessionCodeAlphabet.length)]).join('')
}

export async function allocateUniqueSessionCode(
  exists: (code: string) => Promise<boolean>,
  generateCode: () => string = generateSessionCode,
) {
  for (let attempt = 0; attempt < maxCodeAllocationAttempts; attempt += 1) {
    const code = generateCode()
    if (!(await exists(code))) return code
  }
  throw new HttpsError('internal', 'Could not allocate a session code.')
}

export async function createSessionRecord(
  firestore: Firestore,
  hostUid: string,
  input: ValidCreateSessionInput,
  isPersistent = false,
  generateCode: () => string = generateSessionCode,
): Promise<CreateSessionResult> {
  const sessionReference = firestore.collection('sessions').doc()
  let allocatedCode: string | undefined

  await firestore.runTransaction(async (transaction) => {
    const code = await allocateUniqueSessionCode(
      async (candidate) => (await transaction.get(firestore.collection('sessionCodes').doc(candidate))).exists,
      generateCode,
    )
    const codeReference = firestore.collection('sessionCodes').doc(code)
    const historyReference = firestore.collection('users').doc(hostUid).collection('sessions').doc(sessionReference.id)
    const expirationReference = firestore.collection('sessionExpirations').doc(sessionReference.id)
    const expiresAt = isPersistent ? undefined : anonymousSessionExpiration()
    transaction.create(sessionReference, {
      hostUid,
      code,
      status: 'lobby',
      targetScore: input.targetScore,
      maxPlayers,
      playerCount: 1,
      playerNameKeys: [normalizeDisplayName(input.displayName)],
      nextScoreSequence: 1,
      openScoreReportCount: 0,
      retentionKind: isPersistent ? 'persistent' : 'anonymous',
      ...(expiresAt ? { expiresAt } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(sessionReference.collection('players').doc(hostUid), {
      displayName: input.displayName,
      totalScore: 0,
      joinedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(codeReference, {
      sessionId: sessionReference.id,
      createdAt: FieldValue.serverTimestamp(),
    })
    transaction.create(historyReference, {
      sessionId: sessionReference.id,
      code,
      displayName: input.displayName,
      role: 'host',
      targetScore: input.targetScore,
      joinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (expiresAt) transaction.create(expirationReference, { sessionId: sessionReference.id, code, expiresAt })
    allocatedCode = code
  })

  if (!allocatedCode) throw new HttpsError('internal', 'Could not allocate a session code.')
  return { sessionId: sessionReference.id, code: allocatedCode, status: 'lobby', targetScore: input.targetScore }
}
