import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

import { resolveFirebaseEnvironment, type FirebaseEnvironmentVariables } from './environment'

export const firebaseEnvironment = resolveFirebaseEnvironment(
  import.meta.env as FirebaseEnvironmentVariables,
  import.meta.env.PROD,
)

const app = getApps()[0] ?? initializeApp(firebaseEnvironment.config)

export const firebaseApp = app
export const firebaseAuth = getAuth(app)
export const firebaseFirestore = getFirestore(app)
export const firebaseFunctions = getFunctions(app)
