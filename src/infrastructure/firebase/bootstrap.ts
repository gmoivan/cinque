import { initializeFirebaseAppCheck } from './appCheck'
import { connectFirebaseEmulators } from './emulators'
import { firebaseAuthentication } from './authentication'

export function initializeFirebase() {
  connectFirebaseEmulators()
  initializeFirebaseAppCheck()
  firebaseAuthentication.start()
}
