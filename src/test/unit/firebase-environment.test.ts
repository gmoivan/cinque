import { describe, expect, it } from 'vitest'

import { resolveFirebaseEnvironment, type FirebaseEnvironmentVariables } from '../../infrastructure/firebase/environment'

const stagingVariables: FirebaseEnvironmentVariables = {
  VITE_FIREBASE_ENVIRONMENT: 'staging',
  VITE_FIREBASE_API_KEY: 'public-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'cinque-staging-gmoiv.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'cinque-staging-gmoiv',
  VITE_FIREBASE_STORAGE_BUCKET: 'cinque-staging-gmoiv.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '777083460844',
  VITE_FIREBASE_APP_ID: 'staging-app-id',
  VITE_FIREBASE_APP_CHECK_SITE_KEY: 'public-app-check-site-key',
  VITE_USE_FIREBASE_EMULATORS: 'false',
}

describe('Firebase environment resolution', () => {
  it('defaults development to the isolated local emulator project', () => {
    const environment = resolveFirebaseEnvironment({ VITE_USE_FIREBASE_EMULATORS: 'true' }, false)

    expect(environment.name).toBe('local')
    expect(environment.useEmulators).toBe(true)
    expect(environment.config.projectId).toBe('demo-cinque')
  })

  it('accepts complete staging configuration only for the staging project', () => {
    const environment = resolveFirebaseEnvironment(stagingVariables, true)

    expect(environment.name).toBe('staging')
    expect(environment.useEmulators).toBe(false)
    expect(environment.config.projectId).toBe('cinque-staging-gmoiv')
  })

  it('fails closed for incomplete or crossed cloud configuration', () => {
    expect(() => resolveFirebaseEnvironment({}, true)).toThrow(/VITE_FIREBASE_ENVIRONMENT/)
    expect(() => resolveFirebaseEnvironment({ ...stagingVariables, VITE_USE_FIREBASE_EMULATORS: 'true' }, true))
      .toThrow(/cannot enable emulators/)
    expect(() => resolveFirebaseEnvironment({ ...stagingVariables, VITE_FIREBASE_PROJECT_ID: 'other-project' }, true))
      .toThrow(/Staging builds must use/)
    expect(() => resolveFirebaseEnvironment({
      ...stagingVariables,
      VITE_FIREBASE_ENVIRONMENT: 'production',
    }, true)).toThrow(/cannot use the staging/)
  })
})
