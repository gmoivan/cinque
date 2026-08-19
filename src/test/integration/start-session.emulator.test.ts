// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, collection, doc, getDoc, getDocs, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { afterAll, describe, expect, it } from 'vitest'

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []

function createClient(name: string): Client {
  const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: `start-session-${name}` }, `start-session-${name}`)
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

async function createLobby(host: Client) {
  await signInAnonymously(host.auth)
  return (await httpsCallable(host.functions, 'createSession')({ displayName: 'Host', targetScore: 500 })).data as { sessionId: string; code: string }
}

async function join(client: Client, code: string, displayName: string) {
  await signInAnonymously(client.auth)
  return httpsCallable(client.functions, 'joinSession')({ code, displayName })
}

afterAll(async () => Promise.all(clients.map(({ app }) => deleteApp(app))))

describe('startSession emulator integration', () => {
  it('authorizes the host at two players, activates once, blocks new members, and preserves existing-member reconnect', { timeout: 15_000 }, async () => {
    const host = createClient('host-flow')
    const second = createClient('second-flow')
    const third = createClient('third-flow')
    const lobby = await createLobby(host)
    const start = httpsCallable(host.functions, 'startSession')
    const unauthenticated = createClient('unauthenticated')
    await expect(httpsCallable(unauthenticated.functions, 'startSession')({ sessionId: lobby.sessionId })).rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await expect(start({ sessionId: 'missing-session' })).rejects.toMatchObject({ details: { reason: 'session-not-found' } })
    await expect(start({ sessionId: lobby.sessionId })).rejects.toMatchObject({ details: { reason: 'not-enough-players' } })
    await join(second, lobby.code, 'Second')
    expect((await getDoc(doc(host.firestore, 'sessions', lobby.sessionId, 'players', second.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 0 })
    await expect(httpsCallable(second.functions, 'startSession')({ sessionId: lobby.sessionId })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(start({ sessionId: lobby.sessionId, status: 'active' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(start({ sessionId: 'sessions/invalid' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(start({ sessionId: lobby.sessionId })).resolves.toMatchObject({ data: { status: 'active', playerCount: 2 } })
    const active = await getDoc(doc(host.firestore, 'sessions', lobby.sessionId))
    expect(active.data()).toMatchObject({ status: 'active', playerCount: 2 })
    expect(active.data()?.startedAt).toBeTruthy()
    const startedAt = active.data()?.startedAt
    await join(third, lobby.code, 'Third').then(
      () => { throw new Error('new member unexpectedly joined') },
      (error: unknown) => expect(error).toMatchObject({ details: { reason: 'session-not-joinable' } }),
    )
    expect((await getDoc(doc(host.firestore, 'sessions', lobby.sessionId, 'players', third.auth.currentUser!.uid))).exists()).toBe(false)
    await expect(join(second, lobby.code, 'Different name')).resolves.toMatchObject({ data: { displayName: 'Second', playerCount: 2 } })
    await expect(start({ sessionId: lobby.sessionId })).resolves.toMatchObject({ data: { status: 'active' } })
    expect((await getDoc(doc(host.firestore, 'sessions', lobby.sessionId))).data()?.startedAt).toEqual(startedAt)
  })

  it('allows four-player lobbies and serializes concurrent Join versus Start', async () => {
    const host = createClient('host-race')
    const second = createClient('second-race')
    const racing = createClient('racing-race')
    const lobby = await createLobby(host)
    await join(second, lobby.code, 'Second')
    await signInAnonymously(racing.auth)
    const outcomes = await Promise.allSettled([
      httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId }),
      httpsCallable(racing.functions, 'joinSession')({ code: lobby.code, displayName: 'Racing' }),
    ])
    expect(outcomes[0].status).toBe('fulfilled')
    const session = (await getDoc(doc(host.firestore, 'sessions', lobby.sessionId))).data()!
    const players = await getDocs(collection(host.firestore, 'sessions', lobby.sessionId, 'players'))
    expect(session).toMatchObject({ status: 'active' })
    expect(session.playerCount).toBe(players.size)
    expect(session.playerCount).toBeLessThanOrEqual(4)
    expect(session.playerNameKeys).toHaveLength(players.size)
    const racingMembership = await getDoc(doc(host.firestore, 'sessions', lobby.sessionId, 'players', racing.auth.currentUser!.uid))
    if (outcomes[1].status === 'fulfilled') expect(racingMembership.exists()).toBe(true)
    else expect(racingMembership.exists()).toBe(false)
  })

  it('starts a four-player lobby', async () => {
    const host = createClient('host-four')
    const lobby = await createLobby(host)
    for (const [name, suffix] of [['One', 'one'], ['Two', 'two'], ['Three', 'three']] as const) {
      await join(createClient(`four-${suffix}`), lobby.code, name)
    }
    await expect(httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId })).resolves.toMatchObject({ data: { playerCount: 4, status: 'active' } })
  })
})
