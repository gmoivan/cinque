import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'

import { firebaseAuth, firebaseFirestore } from './config'

const shouldUseEmulators =
  import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'false' &&
  import.meta.env.MODE !== 'production'

let connected = false

export function connectFirebaseEmulators() {
  if (!shouldUseEmulators || connected) {
    return
  }

  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firebaseFirestore, '127.0.0.1', 8080)

  connected = true
}
