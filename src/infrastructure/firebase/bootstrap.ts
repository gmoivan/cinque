import { connectFirebaseEmulators } from './emulators'
import { firebaseAuthentication } from './authentication'

export function initializeFirebase() {
  connectFirebaseEmulators()
  firebaseAuthentication.start()
}
