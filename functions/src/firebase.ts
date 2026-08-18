import { getApps, initializeApp } from 'firebase-admin/app'

export function assertLocalFirestoreEmulator(environment: NodeJS.ProcessEnv = process.env) {
  if (
    environment.FUNCTIONS_EMULATOR === 'true' &&
    !environment.FIRESTORE_EMULATOR_HOST?.trim()
  ) {
    throw new Error('Firestore emulator is required while running Functions locally.')
  }
}

export function initializeFirebaseAdmin(environment: NodeJS.ProcessEnv = process.env) {
  assertLocalFirestoreEmulator(environment)
  return getApps()[0] ?? initializeApp()
}
