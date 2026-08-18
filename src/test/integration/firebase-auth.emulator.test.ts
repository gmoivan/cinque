// @vitest-environment node
import { connectAuthEmulator } from 'firebase/auth'
import { describe, expect, it, vi } from 'vitest'

import { createFirebaseAuthentication } from '../../infrastructure/firebase/authentication'
import { firebaseAuth } from '../../infrastructure/firebase/config'

connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true })

describe('Cinque Authentication Emulator integration', () => {
  it('creates and observes an anonymous identity through the Cinque service', async () => {
    const authentication = createFirebaseAuthentication({ auth: firebaseAuth })
    authentication.start()

    await vi.waitFor(() => expect(authentication.getSnapshot().status).toBe('signedOut'))
    const identity = await authentication.ensureAnonymousIdentity()

    expect(identity.uid).toBeTruthy()
    expect(identity.kind).toBe('anonymous')
    expect(authentication.getSnapshot()).toEqual({ status: 'authenticated', identity })

    authentication.stop()
  })
})
