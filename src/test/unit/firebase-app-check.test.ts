import { beforeEach, describe, expect, it, vi } from 'vitest'

const initializeAppCheck = vi.hoisted(() => vi.fn())
const ReCaptchaEnterpriseProvider = vi.hoisted(() => vi.fn(function provider(this: object, siteKey: string) {
  Object.assign(this, { siteKey })
}))
const firebaseEnvironment = vi.hoisted(() => ({
  name: 'staging' as 'local' | 'staging',
  useEmulators: false,
  appCheckSiteKey: 'public-site-key',
}))

vi.mock('firebase/app-check', () => ({ initializeAppCheck, ReCaptchaEnterpriseProvider }))
vi.mock('../../infrastructure/firebase/config', () => ({ firebaseApp: {}, firebaseEnvironment }))

describe('Firebase App Check bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    initializeAppCheck.mockClear()
    ReCaptchaEnterpriseProvider.mockClear()
    firebaseEnvironment.name = 'staging'
    Reflect.deleteProperty(globalThis, '__cinqueFirebaseAppCheckInitialized__')
  })

  it('initializes reCAPTCHA Enterprise once for staging', async () => {
    const { initializeFirebaseAppCheck } = await import('../../infrastructure/firebase/appCheck')

    initializeFirebaseAppCheck()
    initializeFirebaseAppCheck()

    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledOnce()
    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('public-site-key')
    expect(initializeAppCheck).toHaveBeenCalledOnce()
  })

  it('does not initialize App Check against local emulators', async () => {
    firebaseEnvironment.name = 'local'
    const { initializeFirebaseAppCheck } = await import('../../infrastructure/firebase/appCheck')

    initializeFirebaseAppCheck()

    expect(initializeAppCheck).not.toHaveBeenCalled()
  })
})
