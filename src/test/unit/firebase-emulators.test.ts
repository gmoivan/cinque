import { beforeEach, describe, expect, it, vi } from 'vitest'

const connectAuthEmulator = vi.hoisted(() => vi.fn())
const connectFirestoreEmulator = vi.hoisted(() => vi.fn())

vi.mock('firebase/auth', () => ({ connectAuthEmulator }))
vi.mock('firebase/firestore', () => ({ connectFirestoreEmulator }))
vi.mock('../../infrastructure/firebase/config', () => ({
  firebaseAuth: {},
  firebaseFirestore: {},
}))

describe('Firebase emulator wiring', () => {
  beforeEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis, '__cinqueFirebaseEmulatorsConnected__')
    connectAuthEmulator.mockClear()
    connectFirestoreEmulator.mockClear()
  })

  it('does not enable emulators for production builds', async () => {
    const { shouldConnectFirebaseEmulators } = await import('../../infrastructure/firebase/emulators')

    expect(shouldConnectFirebaseEmulators(true)).toBe(false)
  })

  it('connects local Auth and Firestore emulators only once across module reloads', async () => {
    const { connectFirebaseEmulators, shouldConnectFirebaseEmulators } = await import(
      '../../infrastructure/firebase/emulators'
    )

    expect(shouldConnectFirebaseEmulators(false)).toBe(true)

    connectFirebaseEmulators()
    vi.resetModules()
    const reloaded = await import('../../infrastructure/firebase/emulators')
    reloaded.connectFirebaseEmulators()

    expect(connectAuthEmulator).toHaveBeenCalledTimes(1)
    expect(connectAuthEmulator).toHaveBeenCalledWith({}, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
    expect(connectFirestoreEmulator).toHaveBeenCalledTimes(1)
    expect(connectFirestoreEmulator).toHaveBeenCalledWith({}, '127.0.0.1', 8080)
  })
})
