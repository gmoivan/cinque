import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'demo-cinque.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'demo-cinque',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'demo-cinque.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? 'demo-sender-id',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? 'demo-app-id',
}

const app = getApps()[0] ?? initializeApp(firebaseConfig)

export const firebaseApp = app
export const firebaseAuth = getAuth(app)
export const firebaseFirestore = getFirestore(app)
