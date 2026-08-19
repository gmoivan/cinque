// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { afterAll, describe, expect, it } from 'vitest'

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []
let counter = 0
function client(name: string): Client {
  const suffix = `${name}-${counter++}`
  const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: `report-score-${suffix}` }, `report-score-${suffix}`)
  const auth = getAuth(app); const firestore = getFirestore(app); const functions = getFunctions(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(firestore, '127.0.0.1', 8080); connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  const result = { app, auth, firestore, functions }; clients.push(result); return result
}
async function activeSession() {
  const host = client('host'); const guest = client('guest'); const outsider = client('outsider')
  await signInAnonymously(host.auth)
  const lobby = (await httpsCallable(host.functions, 'createSession')({ displayName: 'Host', targetScore: 200 })).data as { sessionId: string, code: string }
  await signInAnonymously(guest.auth); await signInAnonymously(outsider.auth)
  await httpsCallable(guest.functions, 'joinSession')({ code: lobby.code, displayName: 'Guest' }); await httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId })
  const scoreEntryId = '123e4567-e89b-42d3-a456-426614174101'
  await httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 15, commandId: scoreEntryId })
  return { host, guest, outsider, scoreEntryId, ...lobby }
}
afterAll(async () => Promise.all(clients.map(({ app }) => deleteApp(app))))

describe('reportScore emulator integration', () => {
  it('authoritatively creates one retry-safe open report without changing scores or session', { timeout: 15_000 }, async () => {
    const { host, guest, outsider, sessionId, scoreEntryId } = await activeSession()
    const report = httpsCallable(guest.functions, 'reportScore'); const commandId = '123e4567-e89b-42d3-a456-426614174102'
    const input = { sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'Puntos incorrectos', proposedPoints: 0, commandId }
    await expect(report(input)).resolves.toMatchObject({ data: { status: 'open', commandId } })
    await expect(report(input)).resolves.toMatchObject({ data: { status: 'open', commandId } })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'players', host.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 15 })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active' })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'scoreReports', commandId))).data()).toMatchObject({ status: 'open', reporterUid: guest.auth.currentUser!.uid, proposedPoints: 0 })
    await expect(report({ ...input, commandId: '123e4567-e89b-42d3-a456-426614174103' })).rejects.toMatchObject({ details: { reason: 'open-report-exists' } })
    await expect(httpsCallable(host.functions, 'reportScore')(input)).rejects.toMatchObject({ details: { reason: 'cannot-report-own-score' } })
    await expect(httpsCallable(outsider.functions, 'reportScore')({ ...input, commandId: '123e4567-e89b-42d3-a456-426614174104' })).rejects.toMatchObject({ details: { reason: 'not-session-member' } })
  })

  it('rejects blank/invalid reports and preserves a single open report under concurrency', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession(); const owner = host.auth.currentUser!.uid
    const report = httpsCallable(guest.functions, 'reportScore')
    await expect(report({ sessionId, scoreOwnerUid: owner, scoreEntryId, reason: ' ', commandId: '123e4567-e89b-42d3-a456-426614174105' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    await expect(report({ sessionId, scoreOwnerUid: owner, scoreEntryId, reason: 'Wrong', proposedPoints: 7, commandId: '123e4567-e89b-42d3-a456-426614174106' })).rejects.toMatchObject({ code: 'functions/invalid-argument' })
    const [one, two] = await Promise.allSettled([report({ sessionId, scoreOwnerUid: owner, scoreEntryId, reason: 'One', commandId: '123e4567-e89b-42d3-a456-426614174107' }), report({ sessionId, scoreOwnerUid: owner, scoreEntryId, reason: 'Two', commandId: '123e4567-e89b-42d3-a456-426614174108' })])
    expect([one, two].filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect((await getDocs(collection(guest.firestore, 'sessions', sessionId, 'scoreReports'))).size).toBe(1)
  })

  it('permits reporting an immutable score after the session has finished', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession()
    await httpsCallable(host.functions, 'recordScore')({ sessionId, points: 185, commandId: '123e4567-e89b-42d3-a456-426614174109' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'finished' })
    await expect(httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'Revisar puntuación final', commandId: '123e4567-e89b-42d3-a456-426614174110' })).resolves.toMatchObject({ data: { status: 'open' } })
  })
})
