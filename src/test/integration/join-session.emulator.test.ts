// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { afterAll, describe, expect, it } from 'vitest'

interface TestClient {
  readonly app: FirebaseApp
  readonly auth: Auth
  readonly firestore: Firestore
  readonly functions: Functions
}

const clients: TestClient[] = []

function createClient(name: string): TestClient {
  const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: `join-session-${name}` }, `join-session-${name}`)
  const auth = getAuth(app)
  const firestore = getFirestore(app)
  const functions = getFunctions(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  const client = { app, auth, firestore, functions }
  clients.push(client)
  return client
}

afterAll(async () => Promise.all(clients.map(({ app }) => deleteApp(app))))

async function createLobby(host: TestClient, displayName = 'Host') {
  await signInAnonymously(host.auth)
  const createSession = httpsCallable(host.functions, 'createSession')
  return (await createSession({ displayName, targetScore: 500 })).data as { sessionId: string, code: string }
}

describe('joinSession emulator integration', () => {
  it('requires authentication and rejects malformed or spoofed input', async () => {
    const client = createClient('unauthenticated')
    const joinSession = httpsCallable(client.functions, 'joinSession')
    await expect(joinSession({ code: 'ABC234', displayName: 'Guest' })).rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await signInAnonymously(client.auth)
    await expect(joinSession({ code: 'bad', displayName: 'Guest' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(joinSession({ code: 'ABC234', displayName: 'Guest', uid: 'spoofed' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
  })

  it('joins through the Callable, grants member reads, and preserves private/direct-write protections', async () => {
    const host = createClient('host-happy')
    const guest = createClient('guest-happy')
    const lobby = await createLobby(host)
    const guestCredential = await signInAnonymously(guest.auth)
    const joinSession = httpsCallable(guest.functions, 'joinSession')
    const result = await joinSession({ code: lobby.code.toLowerCase(), displayName: '  Guest  ' })
    expect(result.data).toMatchObject({ sessionId: lobby.sessionId, code: lobby.code, status: 'lobby', displayName: 'Guest', playerCount: 2 })

    const joinedSession = await getDoc(doc(guest.firestore, 'sessions', lobby.sessionId))
    expect(joinedSession.data()).toMatchObject({ playerCount: 2, playerNameKeys: ['host', 'guest'] })
    expect((await getDoc(doc(host.firestore, 'sessions', lobby.sessionId, 'players', guestCredential.user.uid))).data()).toMatchObject({ displayName: 'Guest' })
    expect((await getDoc(doc(guest.firestore, 'sessions', lobby.sessionId, 'players', host.auth.currentUser!.uid))).data()).toMatchObject({ displayName: 'Host' })
    await expect(getDoc(doc(guest.firestore, 'sessionCodes', lobby.code))).rejects.toBeTruthy()
    await expect(setDoc(doc(guest.firestore, 'sessions', lobby.sessionId, 'players', guestCredential.user.uid), { displayName: 'Changed' })).rejects.toBeTruthy()
  })

  it('returns sanitized not-found and duplicate-name outcomes', async () => {
    const host = createClient('host-duplicate')
    const guest = createClient('guest-duplicate')
    const lobby = await createLobby(host, 'Ívan')
    await signInAnonymously(guest.auth)
    const joinSession = httpsCallable(guest.functions, 'joinSession')
    await expect(joinSession({ code: 'ABC234', displayName: 'Guest' })).rejects.toMatchObject({
      code: 'functions/failed-precondition', details: { reason: 'session-not-found' },
    })
    await expect(joinSession({ code: lobby.code, displayName: 'I\u0301VAN' })).rejects.toMatchObject({
      code: 'functions/failed-precondition', details: { reason: 'display-name-taken' },
    })
  })

  it('is idempotent for an existing member and cannot overfill a concurrent final slot', async () => {
    const host = createClient('host-capacity')
    const first = createClient('first-capacity')
    const second = createClient('second-capacity')
    const finalA = createClient('final-a')
    const finalB = createClient('final-b')
    const lobby = await createLobby(host)
    for (const [client, name] of [[first, 'One'], [second, 'Two']] as const) {
      await signInAnonymously(client.auth)
      await httpsCallable(client.functions, 'joinSession')({ code: lobby.code, displayName: name })
    }
    await signInAnonymously(finalA.auth)
    await signInAnonymously(finalB.auth)
    const joinA = httpsCallable(finalA.functions, 'joinSession')({ code: lobby.code, displayName: 'Three' })
    const joinB = httpsCallable(finalB.functions, 'joinSession')({ code: lobby.code, displayName: 'Four' })
    const outcomes = await Promise.allSettled([joinA, joinB])
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)

    const retried = await httpsCallable(first.functions, 'joinSession')({ code: lobby.code, displayName: 'Renamed' })
    expect(retried.data).toMatchObject({ displayName: 'One', playerCount: 4 })
    const session = await getDoc(doc(host.firestore, 'sessions', lobby.sessionId))
    expect(session.data()).toMatchObject({ playerCount: 4 })
    expect(session.data()?.playerNameKeys).toHaveLength(4)
  })
})
