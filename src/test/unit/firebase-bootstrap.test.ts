import { beforeEach, describe, expect, it, vi } from 'vitest'

const connectFirebaseEmulators = vi.hoisted(() => vi.fn())
const start = vi.hoisted(() => vi.fn())

vi.mock('../../infrastructure/firebase/emulators', () => ({ connectFirebaseEmulators }))
vi.mock('../../infrastructure/firebase/authentication', () => ({ firebaseAuthentication: { start } }))

describe('Firebase bootstrap', () => {
  beforeEach(() => {
    connectFirebaseEmulators.mockClear()
    start.mockClear()
  })

  it('initializes Firebase infrastructure before the application renders', async () => {
    const { initializeFirebase } = await import('../../infrastructure/firebase/bootstrap')

    initializeFirebase()

    expect(connectFirebaseEmulators).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledOnce()
  })
})
