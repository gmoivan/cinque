// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { afterAll, describe, expect, it, vi } from 'vitest'

import type { CurrentSession } from '../../application/sessions'
import { FirebaseSessionService } from '../../infrastructure/firebase/sessions'

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []
let counter = 0
function client(name: string): Client {
  const suffix = `${name}-${counter++}`
  const app = initializeApp({ projectId: 'demo-cinque', apiKey: 'demo-api-key', appId: `realtime-${suffix}` }, `realtime-${suffix}`)
  const auth = getAuth(app); const firestore = getFirestore(app); const functions = getFunctions(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  const result = { app, auth, firestore, functions }; clients.push(result); return result
}
afterAll(async () => Promise.all(clients.map(({ app }) => deleteApp(app))))

describe('session realtime integration', () => {
  it('streams every authorized MVP state change and stops cleanly', { timeout: 25_000 }, async () => {
    const host = client('host'); const guest = client('guest')
    await signInAnonymously(host.auth)
    const lobby = (await httpsCallable(host.functions, 'createSession')({ displayName: 'Host', targetScore: 200 })).data as { sessionId: string; code: string }
    const service = new FirebaseSessionService(host.functions, host.firestore)
    let latest: CurrentSession | undefined
    const error = vi.fn()
    const stop = service.subscribeToSession(lobby.sessionId, host.auth.currentUser!.uid, (session) => { latest = session }, error)
    await vi.waitFor(() => expect(latest).toMatchObject({ status: 'lobby', playerCount: 1 }), { timeout: 5_000 })

    await signInAnonymously(guest.auth)
    await httpsCallable(guest.functions, 'joinSession')({ code: lobby.code, displayName: 'Guest' })
    await vi.waitFor(() => expect(latest?.players).toHaveLength(2), { timeout: 5_000 })
    await httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId })
    await vi.waitFor(() => expect(latest?.status).toBe('active'), { timeout: 5_000 })

    const firstScore = '123e4567-e89b-42d3-a456-426614174800'
    await httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 200, commandId: firstScore })
    await vi.waitFor(() => expect(latest).toMatchObject({ winnerUid: host.auth.currentUser!.uid, winningTotalScore: 200 }), { timeout: 5_000 })

    const reportId = '123e4567-e89b-42d3-a456-426614174801'
    await httpsCallable(guest.functions, 'reportScore')({ sessionId: lobby.sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId: firstScore, reason: 'Debe ser 195', proposedPoints: 195, commandId: reportId })
    await vi.waitFor(() => expect(latest?.scoreEntries[0].reports?.[0]).toMatchObject({ status: 'open' }), { timeout: 5_000 })

    await httpsCallable(host.functions, 'resolveScoreReport')({ sessionId: lobby.sessionId, reportId, outcome: 'accepted', correctedScore: 195, commandId: '123e4567-e89b-42d3-a456-426614174802' })
    await vi.waitFor(() => {
      expect(latest?.scoreEntries[0]).toMatchObject({ originalPoints: 200, effectivePoints: 195, isCorrected: true })
      expect(latest?.winnerUid).toBeUndefined()
    }, { timeout: 5_000 })

    const secondScore = '123e4567-e89b-42d3-a456-426614174803'
    await httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 5, commandId: secondScore })
    await vi.waitFor(() => expect(latest).toMatchObject({ winningScoreCommandId: secondScore, winningTotalScore: 200 }), { timeout: 5_000 })
    await httpsCallable(host.functions, 'finalizeGame')({ sessionId: lobby.sessionId, commandId: '123e4567-e89b-42d3-a456-426614174804' })
    await vi.waitFor(() => expect(latest?.status).toBe('finished'), { timeout: 5_000 })
    expect(error).not.toHaveBeenCalled()
    const snapshot = latest
    stop()
    await httpsCallable(host.functions, 'reopenGame')({ sessionId: lobby.sessionId, reason: 'Verificar cleanup', commandId: '123e4567-e89b-42d3-a456-426614174805' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(latest).toBe(snapshot)
  })
})
