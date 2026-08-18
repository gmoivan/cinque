import { HttpsError } from 'firebase-functions/https'

export const sessionCodeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const sessionCodeLength = 6
export const maxPlayers = 4

export function validateDisplayName(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Invalid display name.')

  const displayName = value.trim()
  const visibleCharacters = Array.from(displayName)
  if (
    visibleCharacters.length < 1 ||
    visibleCharacters.length > 24 ||
    /[\p{Cc}\p{Cf}]/u.test(displayName) ||
    !visibleCharacters.some((character) => /\S/u.test(character))
  ) {
    throw new HttpsError('invalid-argument', 'Invalid display name.')
  }
  return displayName
}

export function normalizeDisplayName(displayName: string): string {
  return displayName.normalize('NFKC').toLowerCase()
}

export function validateSessionCode(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Invalid session code.')
  const code = value.trim().toUpperCase()
  if (code.length !== sessionCodeLength || !Array.from(code).every((character) => sessionCodeAlphabet.includes(character))) {
    throw new HttpsError('invalid-argument', 'Invalid session code.')
  }
  return code
}
