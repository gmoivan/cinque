import { describe, expect, it } from 'vitest'

import { initializeFirebaseAdmin } from '../src/firebase.js'

describe('Functions Firestore emulator isolation', () => {
  it('fails before Admin initialization when local Firestore routing is absent', () => {
    expect(() => initializeFirebaseAdmin({ FUNCTIONS_EMULATOR: 'true' })).toThrow(
      'Firestore emulator is required while running Functions locally.',
    )
  })

  it('permits local Admin initialization when Firestore emulator routing is configured', () => {
    expect(() => initializeFirebaseAdmin({
      FUNCTIONS_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    })).not.toThrow()
  })
})
