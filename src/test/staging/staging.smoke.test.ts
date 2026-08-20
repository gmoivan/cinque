// @vitest-environment node
import { CustomProvider, initializeAppCheck } from 'firebase/app-check'
import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { doc, getDoc, getFirestore, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { afterAll, describe, expect, it, vi } from 'vitest'

import type { CurrentSession } from '../../application/sessions'
import { FirebaseSessionService } from '../../infrastructure/firebase/sessions'

const config: FirebaseOptions = {
  apiKey: 'AIzaSyDnd-9wK5tXVukwXkl_fbEJtGe5Y7iViZc',
  authDomain: 'cinque-staging-gmoiv.web.app',
  projectId: 'cinque-staging-gmoiv',
  storageBucket: 'cinque-staging-gmoiv.firebasestorage.app',
  messagingSenderId: '777083460844',
  appId: '1:777083460844:web:4828eb6167bc4d1779d9c9',
}
const appCheckDebugToken = process.env.CINQUE_APP_CHECK_DEBUG_TOKEN
if (!appCheckDebugToken) throw new Error('CINQUE_APP_CHECK_DEBUG_TOKEN is required.')

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []

async function exchangeAppCheckToken() {
  const response = await fetch(
    `https://firebaseappcheck.googleapis.com/v1/projects/${config.projectId}/apps/${config.appId}:exchangeDebugToken?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debugToken: appCheckDebugToken }),
    },
  )
  if (!response.ok) throw new Error(`App Check debug exchange failed with ${response.status}.`)
  const result = await response.json() as { token: string; ttl: string }
  return { token: result.token, expireTimeMillis: Date.now() + Number.parseInt(result.ttl, 10) * 1_000 }
}

function client(name: string): Client {
  const app = initializeApp(config, `staging-${name}-${Date.now()}-${Math.random()}`)
  initializeAppCheck(app, {
    provider: new CustomProvider({ getToken: exchangeAppCheckToken }),
    isTokenAutoRefreshEnabled: false,
  })
  const result = { app, auth: getAuth(app), firestore: getFirestore(app), functions: getFunctions(app) }
  clients.push(result)
  return result
}

async function expectCallableFailure(request: Promise<unknown>, code: string) {
  await expect(request).rejects.toMatchObject({ code })
}

afterAll(async () => Promise.all(clients.map(({ app }) => deleteApp(app))))

describe('Cinque staging', () => {
  it('runs the complete two-player MVP flow and security negatives with verified App Check', { timeout: 120_000 }, async () => {
    const host = client('host')
    const guest = client('guest')
    const outsider = client('outsider')
    await Promise.all([signInAnonymously(host.auth), signInAnonymously(guest.auth), signInAnonymously(outsider.auth)])

    const invalidAppCheck = await fetch('https://us-central1-cinque-staging-gmoiv.cloudfunctions.net/createSession', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await host.auth.currentUser!.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { displayName: 'Invalid', targetScore: 200 } }),
    })
    expect(invalidAppCheck.status).toBe(401)
    const malformedAppCheck = await fetch('https://us-central1-cinque-staging-gmoiv.cloudfunctions.net/createSession', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await host.auth.currentUser!.getIdToken()}`,
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': 'invalid-app-check-token',
      },
      body: JSON.stringify({ data: { displayName: 'Invalid', targetScore: 200 } }),
    })
    expect(malformedAppCheck.status).toBe(401)

    const lobby = (await httpsCallable(host.functions, 'createSession')({
      displayName: 'Host Staging',
      targetScore: 200,
    })).data as { sessionId: string; code: string }
    expect(lobby.code).toMatch(/^[A-Z2-9]{6}$/)

    const hostService = new FirebaseSessionService(host.functions, host.firestore)
    const guestService = new FirebaseSessionService(guest.functions, guest.firestore)
    let hostSnapshot: CurrentSession | undefined
    let guestSnapshot: CurrentSession | undefined
    const subscriptionErrors = vi.fn()
    const stopHost = hostService.subscribeToSession(
      lobby.sessionId,
      host.auth.currentUser!.uid,
      (snapshot) => { hostSnapshot = snapshot },
      subscriptionErrors,
    )

    await httpsCallable(guest.functions, 'joinSession')({ code: lobby.code, displayName: 'Guest Staging' })
    const stopGuest = guestService.subscribeToSession(
      lobby.sessionId,
      guest.auth.currentUser!.uid,
      (snapshot) => { guestSnapshot = snapshot },
      subscriptionErrors,
    )
    await vi.waitFor(() => {
      expect(hostSnapshot?.players).toHaveLength(2)
      expect(guestSnapshot?.players).toHaveLength(2)
    }, { timeout: 15_000 })

    await expectCallableFailure(
      httpsCallable(guest.functions, 'startSession')({ sessionId: lobby.sessionId }),
      'functions/permission-denied',
    )
    await expectCallableFailure(
      getDoc(doc(outsider.firestore, 'sessions', lobby.sessionId)),
      'permission-denied',
    )
    await expectCallableFailure(
      getDoc(doc(outsider.firestore, 'users', host.auth.currentUser!.uid, 'sessions', lobby.sessionId)),
      'permission-denied',
    )
    await expectCallableFailure(
      updateDoc(doc(host.firestore, 'sessions', lobby.sessionId), { status: 'finished' }),
      'permission-denied',
    )
    await expectCallableFailure(
      setDoc(doc(outsider.firestore, 'sessions', lobby.sessionId, 'scoreReports', 'forged-report'), { status: 'open' }),
      'permission-denied',
    )
    await expectCallableFailure(
      setDoc(doc(outsider.firestore, 'users', guest.auth.currentUser!.uid, 'sessions', lobby.sessionId), { sessionId: lobby.sessionId }),
      'permission-denied',
    )
    await expectCallableFailure(
      httpsCallable(host.functions, 'reopenGame')({
        sessionId: lobby.sessionId,
        reason: 'Session is still active',
        commandId: randomCommandId(16),
      }),
      'functions/failed-precondition',
    )
    subscriptionErrors.mockClear()

    await httpsCallable(host.functions, 'startSession')({ sessionId: lobby.sessionId })
    await vi.waitFor(() => {
      expect(hostSnapshot?.status).toBe('active')
      expect(guestSnapshot?.status).toBe('active')
    }, { timeout: 15_000 })

    const hostScore = randomCommandId(1)
    await httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 195, commandId: hostScore })
    await expectCallableFailure(
      httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 190, commandId: hostScore }),
      'functions/failed-precondition',
    )
    const guestScore = randomCommandId(2)
    await httpsCallable(guest.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 5, commandId: guestScore })
    await expectCallableFailure(
      setDoc(doc(outsider.firestore, 'sessions', lobby.sessionId, 'players', host.auth.currentUser!.uid, 'scoreEntries', 'forged-entry'), { points: 5 }),
      'permission-denied',
    )
    await expectCallableFailure(
      httpsCallable(guest.functions, 'recordScore')({
        sessionId: lobby.sessionId,
        scoreOwnerUid: host.auth.currentUser!.uid,
        points: 5,
        commandId: randomCommandId(3),
      }),
      'functions/invalid-argument',
    )
    await vi.waitFor(() => {
      expect(hostSnapshot?.scoreEntries).toHaveLength(2)
      expect(guestSnapshot?.scoreEntries).toHaveLength(2)
    }, { timeout: 15_000 })

    const reportId = randomCommandId(4)
    const reportInput = {
      sessionId: lobby.sessionId,
      scoreOwnerUid: host.auth.currentUser!.uid,
      scoreEntryId: hostScore,
      reason: 'Staging correction',
      proposedPoints: 190,
      commandId: reportId,
    }
    await httpsCallable(guest.functions, 'reportScore')(reportInput)
    await expectCallableFailure(
      httpsCallable(guest.functions, 'reportScore')({ ...reportInput, commandId: randomCommandId(5) }),
      'functions/failed-precondition',
    )
    await expectCallableFailure(
      httpsCallable(guest.functions, 'resolveScoreReport')({
        sessionId: lobby.sessionId,
        reportId,
        outcome: 'accepted',
        correctedScore: 190,
        commandId: randomCommandId(6),
      }),
      'functions/permission-denied',
    )
    await httpsCallable(host.functions, 'resolveScoreReport')({
      sessionId: lobby.sessionId,
      reportId,
      outcome: 'accepted',
      correctedScore: 190,
      reason: 'Confirmed in staging',
      commandId: randomCommandId(7),
    })
    await vi.waitFor(() => {
      expect(hostSnapshot?.scoreEntries.find((entry) => entry.entryId === hostScore)).toMatchObject({
        originalPoints: 195,
        effectivePoints: 190,
        isCorrected: true,
      })
    }, { timeout: 15_000 })

    const winningScore = randomCommandId(8)
    await httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 10, commandId: winningScore })
    await vi.waitFor(() => {
      expect(hostSnapshot).toMatchObject({ winnerUid: host.auth.currentUser!.uid, winningTotalScore: 200 })
      expect(guestSnapshot).toMatchObject({ winnerUid: host.auth.currentUser!.uid, winningTotalScore: 200 })
    }, { timeout: 15_000 })

    await expectCallableFailure(
      httpsCallable(guest.functions, 'finalizeGame')({ sessionId: lobby.sessionId, commandId: randomCommandId(9) }),
      'functions/permission-denied',
    )
    await httpsCallable(host.functions, 'finalizeGame')({ sessionId: lobby.sessionId, commandId: randomCommandId(10) })
    await vi.waitFor(() => expect(hostSnapshot?.status).toBe('finished'), { timeout: 15_000 })
    await expectCallableFailure(
      httpsCallable(host.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 5, commandId: randomCommandId(11) }),
      'functions/failed-precondition',
    )

    await expectCallableFailure(
      httpsCallable(guest.functions, 'reopenGame')({
        sessionId: lobby.sessionId,
        reason: 'Unauthorized staging reopen',
        commandId: randomCommandId(12),
      }),
      'functions/permission-denied',
    )
    await expectCallableFailure(
      httpsCallable(host.functions, 'reopenGame')({
        sessionId: lobby.sessionId,
        reason: '   ',
        commandId: randomCommandId(17),
      }),
      'functions/invalid-argument',
    )
    const reopenCommandId = randomCommandId(13)
    await httpsCallable(host.functions, 'reopenGame')({
      sessionId: lobby.sessionId,
      reason: 'Continue staging smoke',
      commandId: reopenCommandId,
    })
    await vi.waitFor(() => {
      expect(hostSnapshot?.status).toBe('active')
      expect(hostSnapshot?.winnerUid).toBeUndefined()
    }, { timeout: 15_000 })
    expect((await getDoc(doc(host.firestore, 'sessions', lobby.sessionId, 'reopenEvents', reopenCommandId))).data())
      .toMatchObject({
        actorUid: host.auth.currentUser!.uid,
        reason: 'Continue staging smoke',
        previousWinnerUid: host.auth.currentUser!.uid,
        previousWinningTotalScore: 200,
      })

    const secondWinner = randomCommandId(14)
    await httpsCallable(guest.functions, 'recordScore')({ sessionId: lobby.sessionId, points: 195, commandId: secondWinner })
    await vi.waitFor(() => expect(guestSnapshot).toMatchObject({
      winnerUid: guest.auth.currentUser!.uid,
      winningTotalScore: 200,
    }), { timeout: 15_000 })
    await httpsCallable(host.functions, 'finalizeGame')({ sessionId: lobby.sessionId, commandId: randomCommandId(15) })
    await vi.waitFor(() => expect(guestSnapshot?.status).toBe('finished'), { timeout: 15_000 })

    stopGuest()
    stopHost()
    expect(subscriptionErrors).not.toHaveBeenCalled()
  })
})

function randomCommandId(suffix: number) {
  return `123e4567-e89b-42d3-a456-${String(426614175000 + suffix)}`
}
