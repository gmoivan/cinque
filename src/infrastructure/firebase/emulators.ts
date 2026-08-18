import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'

import { firebaseAuth, firebaseFirestore } from './config'

let connected = false

export function shouldConnectFirebaseEmulators(isProduction: boolean) {
  return !isProduction
}

export function connectFirebaseEmulators() {
  if (import.meta.env.PROD || connected) {
    return
  }

  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firebaseFirestore, '127.0.0.1', 8080)

  connected = true
}
