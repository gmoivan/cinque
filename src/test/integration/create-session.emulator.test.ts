// @vitest-environment node
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { afterAll, describe, expect, it } from 'vitest'

const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: 'create-session-test' }, 'create-session-test')
const auth = getAuth(app)
const firestore = getFirestore(app)
const functions = getFunctions(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
connectFunctionsEmulator(functions, '127.0.0.1', 5001)

afterAll(async () => deleteApp(app))

describe('createSession emulator integration', () => {
  it('requires authentication', async () => {
    const createSession = httpsCallable(functions, 'createSession')
    await expect(createSession({ displayName: 'Unauthenticated', targetScore: 200 })).rejects.toMatchObject({ code: 'functions/unauthenticated' })
  })

  it('creates a readable host session while client mutations and codes remain private', async () => {
    const credential = await signInAnonymously(auth)
    const createSession = httpsCallable(functions, 'createSession')
    await expect(createSession({
      displayName: 'Host',
      targetScore: 500,
      hostUid: 'attacker-controlled-uid',
      uid: 'attacker-controlled-uid',
    })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    const result = await createSession({ displayName: '  Host  ', targetScore: 500 })
    const data = result.data as { sessionId: string; code: string; status: string; targetScore: number }
    expect(data).toMatchObject({ status: 'lobby', targetScore: 500 })
    expect(data.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/)

    const session = await getDoc(doc(firestore, 'sessions', data.sessionId))
    expect(session.data()).toMatchObject({
      hostUid: credential.user.uid,
      status: 'lobby',
      targetScore: 500,
      maxPlayers: 4,
      playerCount: 1,
      playerNameKeys: ['host'],
    })
    const player = await getDoc(doc(firestore, 'sessions', data.sessionId, 'players', credential.user.uid))
    expect(player.data()).toMatchObject({ displayName: 'Host' })
    expect((await getDoc(doc(firestore, 'sessions', data.sessionId, 'players', 'attacker-controlled-uid'))).exists()).toBe(false)
    await expect(setDoc(doc(firestore, 'sessions', data.sessionId), { status: 'started' })).rejects.toBeTruthy()
    await expect(getDoc(doc(firestore, 'sessionCodes', data.code))).rejects.toBeTruthy()
  })
})
