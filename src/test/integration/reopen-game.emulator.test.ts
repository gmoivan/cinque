// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { afterAll, describe, expect, it } from 'vitest'

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []
let counter = 0

function client(name: string): Client {
  const suffix = `${name}-${counter++}`
  const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: `reopen-${suffix}` }, `reopen-${suffix}`)
  const auth = getAuth(app)
  const firestore = getFirestore(app)
  const functions = getFunctions(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  const result = { app, auth, firestore, functions }
  clients.push(result)
  return result
}

async function finishedGame() {
  const host = client('host')
  const guest = client('guest')
  const anonymous = client('anonymous')
  await signInAnonymously(host.auth)
  const lobby = (await httpsCallable(host.functions, 'createSession')({ displayName: 'Host', targetScore: 200 })).data as { sessionId: string; code: string }
  await signInAnonymously(guest.auth)
  await httpsCallable(guest.functions, 'joinSession')({ code: lobby.code, displayName: 'Guest' })
  await httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId })
  const winningScoreCommandId = '123e4567-e89b-42d3-a456-426614174501'
  const finalizationCommandId = '123e4567-e89b-42d3-a456-426614174502'
  await httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 200, commandId: winningScoreCommandId })
  await httpsCallable(host.functions, 'finalizeGame')({ sessionId: lobby.sessionId, commandId: finalizationCommandId })
  return { host, guest, anonymous, winningScoreCommandId, finalizationCommandId, ...lobby }
}

afterAll(async () => Promise.all(clients.map(({ app }) => deleteApp(app))))

describe('reopenGame emulator integration', () => {
  it('is host-only, auditable, idempotent, and restores the complete active workflow', { timeout: 20_000 }, async () => {
    const { host, guest, anonymous, sessionId, winningScoreCommandId, finalizationCommandId } = await finishedGame()
    const commandId = '123e4567-e89b-42d3-a456-426614174503'
    const reason = 'Corregir el resultado final'
    const before = (await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!

    await expect(httpsCallable(anonymous.functions, 'reopenGame')({ sessionId, reason, commandId }))
      .rejects.toMatchObject({ code: 'functions/unauthenticated' })
    await expect(httpsCallable(guest.functions, 'reopenGame')({ sessionId, reason, commandId }))
      .rejects.toMatchObject({ code: 'functions/permission-denied', details: { reason: 'not-host' } })
    await expect(httpsCallable(host.functions, 'reopenGame')({ sessionId, reason: ' ', commandId }))
      .rejects.toMatchObject({ code: 'functions/invalid-argument' })

    const reopen = httpsCallable(host.functions, 'reopenGame')
    await expect(reopen({ sessionId, reason, commandId })).resolves.toMatchObject({ data: { sessionId, status: 'active', commandId } })
    const active = (await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!
    expect(active).toMatchObject({ status: 'active', lastReopenCommandId: commandId })
    for (const field of ['winnerUid', 'winnerDetectedAt', 'winningScoreCommandId', 'winningTotalScore', 'finalizationCommandId', 'finishedAt']) {
      expect(active[field]).toBeUndefined()
    }
    const event = (await getDoc(doc(host.firestore, 'sessions', sessionId, 'reopenEvents', commandId))).data()!
    expect(event).toMatchObject({
      commandId,
      actorUid: host.auth.currentUser!.uid,
      reason,
      previousStatus: 'finished',
      previousWinnerUid: before.winnerUid,
      previousWinnerDetectedAt: before.winnerDetectedAt,
      previousWinningScoreCommandId: winningScoreCommandId,
      previousWinningTotalScore: 200,
      previousFinalizationCommandId: finalizationCommandId,
      previousFinishedAt: before.finishedAt,
    })
    expect(event.createdAt).toBeDefined()

    await expect(reopen({ sessionId, reason, commandId })).resolves.toMatchObject({ data: { status: 'active', commandId } })
    await expect(reopen({ sessionId, reason: 'Otro motivo', commandId }))
      .rejects.toMatchObject({ details: { reason: 'idempotency-conflict' } })
    await expect(reopen({ sessionId, reason, commandId: '123e4567-e89b-42d3-a456-426614174504' }))
      .rejects.toMatchObject({ details: { reason: 'session-not-finished' } })

    const reportId = '123e4567-e89b-42d3-a456-426614174505'
    await expect(httpsCallable(guest.functions, 'reportScore')({
      sessionId,
      scoreOwnerUid: host.auth.currentUser!.uid,
      scoreEntryId: winningScoreCommandId,
      reason: 'La suma correcta era 190',
      proposedPoints: 190,
      commandId: reportId,
    })).resolves.toMatchObject({ data: { status: 'open' } })
    await expect(httpsCallable(host.functions, 'resolveScoreReport')({
      sessionId,
      reportId,
      outcome: 'accepted',
      correctedScore: 190,
      reason: 'Corrección confirmada',
      commandId: '123e4567-e89b-42d3-a456-426614174506',
    })).resolves.toMatchObject({ data: { outcome: 'accepted', correctedScore: 190 } })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!.winnerUid).toBeUndefined()

    const secondWinnerCommandId = '123e4567-e89b-42d3-a456-426614174507'
    await expect(httpsCallable(host.functions, 'recordScore')({ sessionId, points: 10, commandId: secondWinnerCommandId }))
      .resolves.toMatchObject({ data: { winnerUid: host.auth.currentUser!.uid, winningTotalScore: 200, winningScoreCommandId: secondWinnerCommandId } })
  })
})
