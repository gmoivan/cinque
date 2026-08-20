// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, describe, expect, it } from 'vitest'

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []
let counter = 0
let testEnvironment: RulesTestEnvironment | undefined

function createClient(name: string): Client {
  const suffix = `${name}-${counter++}`
  const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: `record-score-${suffix}` }, `record-score-${suffix}`)
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

async function activeLobby() {
  const host = createClient('host')
  const guest = createClient('guest')
  await signInAnonymously(host.auth)
  const lobby = (await httpsCallable(host.functions, 'createSession')({ displayName: 'Host', targetScore: 200 })).data as { sessionId: string; code: string }
  await signInAnonymously(guest.auth)
  await httpsCallable(guest.functions, 'joinSession')({ code: lobby.code, displayName: 'Guest' })
  await httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId })
  return { host, guest, ...lobby }
}

afterAll(async () => {
  await Promise.all(clients.map(({ app }) => deleteApp(app)))
  await testEnvironment?.cleanup()
})

async function seedScoreLedger(client: Client, sessionId: string, sequences: readonly number[], nextScoreSequence: number) {
  testEnvironment ??= await initializeTestEnvironment({ projectId: 'demo-cinque' })
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    const uid = client.auth.currentUser!.uid
    await Promise.all(sequences.map((sequence, index) => setDoc(
      doc(firestore, 'sessions', sessionId, 'players', uid, 'scoreEntries', `corrupt-${index}`),
      { points: 5, playerUid: uid, sequence, createdAt: new Date() },
    )))
    await updateDoc(doc(firestore, 'sessions', sessionId), { nextScoreSequence })
  })
}

describe('recordScore emulator integration', () => {
  it('records only the caller score and strictly rejects invalid or spoofed data', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId } = await activeLobby()
    const record = httpsCallable(host.functions, 'recordScore')
    const id = '123e4567-e89b-42d3-a456-426614174001'
    await expect(record({ sessionId, points: 25, commandId: id })).resolves.toMatchObject({ data: { totalScore: 25, points: 25, commandId: id, sequence: 1 } })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', host.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 25 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', guest.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 0 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', host.auth.currentUser!.uid, 'scoreEntries', id))).data()).toMatchObject({ points: 25, playerUid: host.auth.currentUser!.uid, sequence: 1 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ nextScoreSequence: 2 })
    await expect(record({ sessionId, points: 0, commandId: id })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(record({ sessionId, points: 7, commandId: id })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(record({ sessionId, points: 5, commandId: id, playerUid: guest.auth.currentUser!.uid })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
  })

  it('is idempotent for same commands and serializes concurrent commands without lost totals', { timeout: 15_000 }, async () => {
    const { host, sessionId } = await activeLobby()
    const record = httpsCallable(host.functions, 'recordScore')
    const same = '123e4567-e89b-42d3-a456-426614174002'
    const sameOutcomes = await Promise.all([record({ sessionId, points: 5, commandId: same }), record({ sessionId, points: 5, commandId: same })])
    expect(sameOutcomes.map((outcome) => (outcome.data as { sequence: number }).sequence)).toEqual([1, 1])
    const concurrentOutcomes = await Promise.all([
      record({ sessionId, points: 5, commandId: '123e4567-e89b-42d3-a456-426614174003' }),
      record({ sessionId, points: 10, commandId: '123e4567-e89b-42d3-a456-426614174004' }),
    ])
    expect(new Set(concurrentOutcomes.map((outcome) => (outcome.data as { sequence: number }).sequence))).toEqual(new Set([2, 3]))
    const playerPath = `sessions/${sessionId}/players/${host.auth.currentUser!.uid}`
    expect((await getDoc(doc(host.firestore, playerPath))).data()).toMatchObject({ totalScore: 20 })
    expect((await getDocs(collection(host.firestore, `${playerPath}/scoreEntries`))).size).toBe(3)
    const entries = await getDocs(collection(host.firestore, `${playerPath}/scoreEntries`))
    expect(entries.docs.map((entry) => entry.data().sequence).sort()).toEqual([1, 2, 3])
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ nextScoreSequence: 4 })
    await expect(record({ sessionId, points: 10, commandId: same })).rejects.toMatchObject({ details: { reason: 'idempotency-conflict' } })
  })

  it('rejects corrupt ledgers and allocates the next sequence only from a complete ledger', { timeout: 15_000 }, async () => {
    const invalidLedgers: Array<{ sequences: number[]; nextScoreSequence: number }> = [
      { sequences: [1, 2], nextScoreSequence: 2 },
      { sequences: [1, 2], nextScoreSequence: 4 },
      { sequences: [1, 1], nextScoreSequence: 3 },
      { sequences: [1, 3], nextScoreSequence: 3 },
      { sequences: [0], nextScoreSequence: 2 },
    ]
    for (const [index, ledger] of invalidLedgers.entries()) {
      const { host, sessionId } = await activeLobby()
      await seedScoreLedger(host, sessionId, ledger.sequences, ledger.nextScoreSequence)
      await expect(httpsCallable(host.functions, 'recordScore')({ sessionId, points: 5, commandId: `123e4567-e89b-42d3-a456-4266141741${index}0` })).rejects.toMatchObject({ code: 'functions/unavailable' })
    }

    const { host, sessionId } = await activeLobby()
    const record = httpsCallable(host.functions, 'recordScore')
    await record({ sessionId, points: 5, commandId: '123e4567-e89b-42d3-a456-426614174120' })
    await record({ sessionId, points: 5, commandId: '123e4567-e89b-42d3-a456-426614174121' })
    await expect(record({ sessionId, points: 5, commandId: '123e4567-e89b-42d3-a456-426614174122' })).resolves.toMatchObject({ data: { sequence: 3 } })
  })

  it('fails closed for an exact replay if the persisted ordering becomes corrupt', { timeout: 15_000 }, async () => {
    const { host, sessionId } = await activeLobby()
    const commandId = '123e4567-e89b-42d3-a456-426614174130'
    const record = httpsCallable(host.functions, 'recordScore')
    await record({ sessionId, points: 5, commandId })
    await seedScoreLedger(host, sessionId, [1], 2)
    await expect(record({ sessionId, points: 5, commandId })).rejects.toMatchObject({ code: 'functions/unavailable' })
  })

  it('detects a winner at the target, keeps scoring active, and preserves the first winner', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId } = await activeLobby()
    const recordGuest = httpsCallable(guest.functions, 'recordScore')
    const recordHost = httpsCallable(host.functions, 'recordScore')
    const below = '123e4567-e89b-42d3-a456-426614174006'
    const winning = '123e4567-e89b-42d3-a456-426614174007'
    await recordGuest({ sessionId, points: 195, commandId: below })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active' })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()).not.toHaveProperty('winnerUid')
    await expect(recordGuest({ sessionId, points: 5, commandId: winning })).resolves.toMatchObject({ data: { totalScore: 200, sequence: 2, winnerUid: guest.auth.currentUser!.uid, winningTotalScore: 200, winningScoreCommandId: winning } })
    const winnerSession = (await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()!
    expect(winnerSession).toMatchObject({ status: 'active', winnerUid: guest.auth.currentUser!.uid, winningTotalScore: 200, winningScoreCommandId: winning })
    expect(winnerSession.winnerDetectedAt).toBeDefined()
    expect(winnerSession.nextScoreSequence).toBe(3)
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'players', guest.auth.currentUser!.uid, 'scoreEntries', winning))).exists()).toBe(true)
    await expect(recordGuest({ sessionId, points: 5, commandId: winning })).resolves.toMatchObject({ data: { totalScore: 200, sequence: 2, winnerUid: guest.auth.currentUser!.uid, winningScoreCommandId: winning } })
    await expect(recordGuest({ sessionId, points: 10, commandId: '123e4567-e89b-42d3-a456-426614174008' })).resolves.toMatchObject({ data: { totalScore: 210, winnerUid: guest.auth.currentUser!.uid } })
    await expect(recordHost({ sessionId, points: 205, commandId: '123e4567-e89b-42d3-a456-426614174009' })).resolves.toMatchObject({ data: { totalScore: 205, winnerUid: guest.auth.currentUser!.uid } })
    const after = (await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()!
    expect(after).toMatchObject({ status: 'active', winnerUid: winnerSession.winnerUid, winningTotalScore: winnerSession.winningTotalScore, winningScoreCommandId: winnerSession.winningScoreCommandId })
    expect(after.winnerDetectedAt).toEqual(winnerSession.winnerDetectedAt)
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'players', guest.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 210 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', host.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 205 })
  })

  it('uses transaction ordering to establish exactly one winner when members cross concurrently', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId } = await activeLobby()
    const recordHost = httpsCallable(host.functions, 'recordScore')
    const recordGuest = httpsCallable(guest.functions, 'recordScore')
    await recordHost({ sessionId, points: 195, commandId: '123e4567-e89b-42d3-a456-426614174010' })
    await recordGuest({ sessionId, points: 195, commandId: '123e4567-e89b-42d3-a456-426614174011' })
    const hostCrossing = '123e4567-e89b-42d3-a456-426614174012'
    const guestCrossing = '123e4567-e89b-42d3-a456-426614174013'
    const outcomes = await Promise.allSettled([
      recordHost({ sessionId, points: 5, commandId: hostCrossing }),
      recordGuest({ sessionId, points: 5, commandId: guestCrossing }),
    ])
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2)
    const session = (await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!
    const hostUid = host.auth.currentUser!.uid
    const guestUid = guest.auth.currentUser!.uid
    expect(session).toMatchObject({ status: 'active', winningTotalScore: 200 })
    expect([hostUid, guestUid]).toContain(session.winnerUid)
    expect(session.winningScoreCommandId).toBe(session.winnerUid === hostUid ? hostCrossing : guestCrossing)
    expect(session.nextScoreSequence).toBe(5)
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', hostUid))).data()).toMatchObject({ totalScore: 200 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', guestUid))).data()).toMatchObject({ totalScore: 200 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', hostUid, 'scoreEntries', hostCrossing))).exists()).toBe(true)
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', guestUid, 'scoreEntries', guestCrossing))).exists()).toBe(true)
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', session.winnerUid, 'scoreEntries', session.winningScoreCommandId))).exists()).toBe(true)
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', session.winnerUid, 'scoreEntries', session.winningScoreCommandId))).data()).toMatchObject({ sequence: 3 })
  })
})
