import { randomInt } from 'node:crypto'

import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

export const sessionCodeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const sessionCodeLength = 6
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
  if (typeof candidate.displayName !== 'string') {
    throw new HttpsError('invalid-argument', 'Invalid display name.')
  }
  const displayName = candidate.displayName.trim()
  const visibleCharacters = Array.from(displayName)
  if (
    visibleCharacters.length < 1 ||
    visibleCharacters.length > 24 ||
    /[\p{Cc}\p{Cf}]/u.test(displayName) ||
    !visibleCharacters.some((character) => /\S/u.test(character))
  ) {
    throw new HttpsError('invalid-argument', 'Invalid display name.')
  }
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
    transaction.create(sessionReference, {
      hostUid,
      status: 'lobby',
      targetScore: input.targetScore,
      maxPlayers: 4,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(sessionReference.collection('players').doc(hostUid), {
      displayName: input.displayName,
      joinedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(codeReference, {
      sessionId: sessionReference.id,
      createdAt: FieldValue.serverTimestamp(),
    })
    allocatedCode = code
  })

  if (!allocatedCode) throw new HttpsError('internal', 'Could not allocate a session code.')
  return { sessionId: sessionReference.id, code: allocatedCode, status: 'lobby', targetScore: input.targetScore }
}
