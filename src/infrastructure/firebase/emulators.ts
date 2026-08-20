import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { connectFunctionsEmulator } from 'firebase/functions'

import { firebaseAuth, firebaseEnvironment, firebaseFirestore, firebaseFunctions } from './config'

const emulatorConnectionKey = '__cinqueFirebaseEmulatorsConnected__'

type EmulatorConnectionGlobal = typeof globalThis & {
  [emulatorConnectionKey]?: boolean
}

function hasConnectedEmulators() {
  return (globalThis as EmulatorConnectionGlobal)[emulatorConnectionKey] === true
}

function markEmulatorsConnected() {
  ;(globalThis as EmulatorConnectionGlobal)[emulatorConnectionKey] = true
}

export function shouldConnectFirebaseEmulators(environment = firebaseEnvironment) {
  return environment.name === 'local' && environment.useEmulators
}

export function connectFirebaseEmulators() {
  if (!shouldConnectFirebaseEmulators() || hasConnectedEmulators()) {
    return
  }

  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firebaseFirestore, '127.0.0.1', 8080)
  connectFunctionsEmulator(firebaseFunctions, '127.0.0.1', 5001)

  markEmulatorsConnected()
}
