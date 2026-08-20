// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { afterAll, describe, expect, it } from 'vitest'

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []; let counter = 0
function client(name: string): Client { const suffix = `${name}-${counter++}`; const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: `finalize-${suffix}` }, `finalize-${suffix}`); const auth = getAuth(app); const firestore = getFirestore(app); const functions = getFunctions(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(firestore, '127.0.0.1', 8080); connectFunctionsEmulator(functions, '127.0.0.1', 5001); const result = { app, auth, firestore, functions }; clients.push(result); return result }
async function detectedWinner() { const host = client('host'); const guest = client('guest'); const anonymous = client('anonymous'); await signInAnonymously(host.auth); const lobby = (await httpsCallable(host.functions, 'createSession')({ displayName: 'Host', targetScore: 200 })).data as { sessionId: string; code: string }; await signInAnonymously(guest.auth); await httpsCallable(guest.functions, 'joinSession')({ code: lobby.code, displayName: 'Guest' }); await httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId }); const scoreId = '123e4567-e89b-42d3-a456-426614174301'; await httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 200, commandId: scoreId }); return { host, guest, anonymous, scoreId, ...lobby } }
afterAll(async () => Promise.all(clients.map(({ app }) => deleteApp(app))))

describe('finalizeGame emulator integration', () => {
  it('lets only the host finalize a detected winner, preserves results, and blocks subsequent scoring', { timeout: 15_000 }, async () => {
    const { host, guest, anonymous, sessionId, scoreId } = await detectedWinner(); const commandId = '123e4567-e89b-42d3-a456-426614174302'; const finalize = httpsCallable(host.functions, 'finalizeGame')
    const before = (await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!
    expect(before).toMatchObject({ status: 'active', winnerUid: host.auth.currentUser!.uid, winningScoreCommandId: scoreId, winningTotalScore: 200 })
    await expect(httpsCallable(anonymous.functions, 'finalizeGame')({ sessionId, commandId })).rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await expect(httpsCallable(guest.functions, 'finalizeGame')({ sessionId, commandId })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    await expect(finalize({ sessionId, commandId })).resolves.toMatchObject({ data: { status: 'finished', commandId, winnerUid: before.winnerUid, winningScoreCommandId: scoreId, winningTotalScore: 200 } })
    const after = (await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!
    expect(after).toMatchObject({ status: 'finished', finalizationCommandId: commandId, winnerUid: before.winnerUid, winnerDetectedAt: before.winnerDetectedAt, winningScoreCommandId: scoreId, winningTotalScore: 200 })
    expect(after.finishedAt).toBeDefined()
    await expect(finalize({ sessionId, commandId })).resolves.toMatchObject({ data: { status: 'finished', commandId } })
    await expect(finalize({ sessionId, commandId: '123e4567-e89b-42d3-a456-426614174303' })).rejects.toMatchObject({ details: { reason: 'session-finalized' } })
    await expect(httpsCallable(host.functions, 'recordScore')({ sessionId, points: 5, commandId: '123e4567-e89b-42d3-a456-426614174304' })).rejects.toMatchObject({ details: { reason: 'session-not-active' } })
    await expect(httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId: scoreId, reason: 'Reporte tardío', commandId: '123e4567-e89b-42d3-a456-426614174311' })).rejects.toMatchObject({ details: { reason: 'session-finalized' } })
  })

  it('blocks finalization with an open report, then finalizes after rejection', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreId } = await detectedWinner()
    const reportId = '123e4567-e89b-42d3-a456-426614174305'; await httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId: scoreId, reason: 'Revisar', commandId: reportId })
    const blocked = '123e4567-e89b-42d3-a456-426614174306'
    await expect(httpsCallable(host.functions, 'finalizeGame')({ sessionId, commandId: blocked })).rejects.toMatchObject({ details: { reason: 'open-score-reports' } })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active', openScoreReportCount: 1 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReports', reportId))).data()).toMatchObject({ status: 'open' })
    await httpsCallable(host.functions, 'resolveScoreReport')({ sessionId, reportId, outcome: 'rejected', commandId: '123e4567-e89b-42d3-a456-426614174307' })
    await expect(httpsCallable(host.functions, 'finalizeGame')({ sessionId, commandId: '123e4567-e89b-42d3-a456-426614174308' })).resolves.toMatchObject({ data: { status: 'finished' } })
  })

  it('never commits both finalization and a newly open report', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreId } = await detectedWinner()
    const [finalization, report] = await Promise.allSettled([
      httpsCallable(host.functions, 'finalizeGame')({ sessionId, commandId: '123e4567-e89b-42d3-a456-426614174309' }),
      httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId: scoreId, reason: 'Concurrente', commandId: '123e4567-e89b-42d3-a456-426614174310' }),
    ])
    const session = (await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!
    const open = await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReports', '123e4567-e89b-42d3-a456-426614174310'))
    expect(!(session.status === 'finished' && open.exists())).toBe(true)
    expect([finalization.status, report.status]).toContain('fulfilled')
  })
})
