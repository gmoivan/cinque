import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

import { firebaseApp, firebaseEnvironment } from './config'

const appCheckInitializationKey = '__cinqueFirebaseAppCheckInitialized__'

type AppCheckInitializationGlobal = typeof globalThis & {
  [appCheckInitializationKey]?: boolean
}
export function initializeFirebaseAppCheck() {
  if (firebaseEnvironment.name === 'local') return
  const state = globalThis as AppCheckInitializationGlobal
  if (state[appCheckInitializationKey]) return

  const siteKey = firebaseEnvironment.appCheckSiteKey
  if (!siteKey) throw new Error('Firebase App Check site key is required outside local development.')

  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  })
  state[appCheckInitializationKey] = true
}
