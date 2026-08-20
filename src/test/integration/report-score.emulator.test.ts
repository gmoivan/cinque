// @vitest-environment node
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, updateDoc, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, describe, expect, it } from 'vitest'

interface Client { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions }
const clients: Client[] = []
let counter = 0
let testEnvironment: RulesTestEnvironment | undefined
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
afterAll(async () => { await Promise.all(clients.map(({ app }) => deleteApp(app))); await testEnvironment?.cleanup() })

async function finalizeForGuard(sessionId: string) {
  testEnvironment ??= await initializeTestEnvironment({ projectId: 'demo-cinque' })
  await testEnvironment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'sessions', sessionId), { status: 'finished' }))
}

async function setOpenReportCount(sessionId: string, openScoreReportCount: number) {
  testEnvironment ??= await initializeTestEnvironment({ projectId: 'demo-cinque' })
  await testEnvironment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'sessions', sessionId), { openScoreReportCount }))
}

describe('reportScore emulator integration', () => {
  it('authoritatively creates one retry-safe open report without changing scores or session', { timeout: 15_000 }, async () => {
    const { host, guest, outsider, sessionId, scoreEntryId } = await activeSession()
    const report = httpsCallable(guest.functions, 'reportScore'); const commandId = '123e4567-e89b-42d3-a456-426614174102'
    const input = { sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'Puntos incorrectos', proposedPoints: 0, commandId }
    await expect(report(input)).resolves.toMatchObject({ data: { status: 'open', commandId } })
    await expect(report(input)).resolves.toMatchObject({ data: { status: 'open', commandId } })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'players', host.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 15 })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active', openScoreReportCount: 1 })
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

  it('rejects report creation when the global open-report aggregate is too high without writing', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession()
    const reportId = '123e4567-e89b-42d3-a456-426614174124'
    await setOpenReportCount(sessionId, 1)
    await expect(httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'No debe crearse', commandId: reportId })).rejects.toMatchObject({ code: 'functions/unavailable' })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()).toMatchObject({ openScoreReportCount: 1 })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'scoreReports', reportId))).exists()).toBe(false)
    expect((await getDocs(collection(guest.firestore, 'sessions', sessionId, 'scoreReports'))).size).toBe(0)
  })

  it('rejects report creation when the global open-report aggregate is too low without writing', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession()
    const owner = host.auth.currentUser!.uid
    const firstReportId = '123e4567-e89b-42d3-a456-426614174125'
    await httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: owner, scoreEntryId, reason: 'Primer reporte', commandId: firstReportId })
    const secondScoreId = '123e4567-e89b-42d3-a456-426614174126'
    await httpsCallable(host.functions, 'recordScore')({ sessionId, points: 5, commandId: secondScoreId })
    await setOpenReportCount(sessionId, 0)
    const secondReportId = '123e4567-e89b-42d3-a456-426614174127'
    await expect(httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: owner, scoreEntryId: secondScoreId, reason: 'No debe crearse', commandId: secondReportId })).rejects.toMatchObject({ code: 'functions/unavailable' })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId))).data()).toMatchObject({ openScoreReportCount: 0 })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'scoreReports', firstReportId))).data()).toMatchObject({ status: 'open' })
    expect((await getDoc(doc(guest.firestore, 'sessions', sessionId, 'scoreReports', secondReportId))).exists()).toBe(false)
    expect((await getDocs(collection(guest.firestore, 'sessions', sessionId, 'scoreReports'))).size).toBe(1)
  })

  it('rejects resolution when one open report has an aggregate of two without partial mutations', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession()
    const owner = host.auth.currentUser!.uid
    const reportId = '123e4567-e89b-42d3-a456-426614174128'
    const resolutionId = '123e4567-e89b-42d3-a456-426614174129'
    await httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: owner, scoreEntryId, reason: 'Revisar', commandId: reportId })
    await setOpenReportCount(sessionId, 2)
    await expect(httpsCallable(host.functions, 'resolveScoreReport')({ sessionId, reportId, outcome: 'accepted', correctedScore: 0, commandId: resolutionId })).rejects.toMatchObject({ code: 'functions/unavailable' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active', openScoreReportCount: 2 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReports', reportId))).data()).toMatchObject({ status: 'open' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', owner))).data()).toMatchObject({ totalScore: 15 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReportResolutions', resolutionId))).exists()).toBe(false)
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreCorrections', resolutionId))).exists()).toBe(false)
  })

  it('rejects resolution when an open report has an aggregate of zero without partial mutations', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession()
    const reportId = '123e4567-e89b-42d3-a456-426614174130'
    const resolutionId = '123e4567-e89b-42d3-a456-426614174131'
    await httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'Revisar', commandId: reportId })
    await setOpenReportCount(sessionId, 0)
    await expect(httpsCallable(host.functions, 'resolveScoreReport')({ sessionId, reportId, outcome: 'rejected', commandId: resolutionId })).rejects.toMatchObject({ code: 'functions/unavailable' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active', openScoreReportCount: 0 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReports', reportId))).data()).toMatchObject({ status: 'open' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReportResolutions', resolutionId))).exists()).toBe(false)
    expect((await getDocs(collection(host.firestore, 'sessions', sessionId, 'scoreCorrections'))).size).toBe(0)
  })

  it('replays an active winner correction that removes the winning crossing', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession()
    await httpsCallable(host.functions, 'recordScore')({ sessionId, points: 185, commandId: '123e4567-e89b-42d3-a456-426614174109' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active', winnerUid: host.auth.currentUser!.uid })
    const reportId = '123e4567-e89b-42d3-a456-426614174110'
    await httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'Revisar puntuación inicial', commandId: reportId })
    const resolution = { sessionId, reportId, outcome: 'accepted', correctedScore: 0, commandId: '123e4567-e89b-42d3-a456-426614174115' }
    const resolutions = await Promise.all([httpsCallable(host.functions, 'resolveScoreReport')(resolution), httpsCallable(host.functions, 'resolveScoreReport')(resolution)])
    expect(resolutions).toHaveLength(2)
    expect(resolutions[0]).toMatchObject({ data: { outcome: 'accepted', correctedScore: 0 } })
    expect(resolutions[1]).toMatchObject({ data: { outcome: 'accepted', correctedScore: 0 } })
    const session = (await getDoc(doc(host.firestore, 'sessions', sessionId))).data()!
    expect(session).toMatchObject({ status: 'active', openScoreReportCount: 0 })
    expect(session).not.toHaveProperty('winnerUid')
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', host.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 185 })
    expect((await getDocs(collection(host.firestore, 'sessions', sessionId, 'scoreCorrections'))).size).toBe(1)
  })

  it('replays an active correction that replaces the first winner', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId } = await activeSession()
    const guestScore = '123e4567-e89b-42d3-a456-426614174116'; const hostCrossing = '123e4567-e89b-42d3-a456-426614174117'
    await httpsCallable(guest.functions, 'recordScore')({ sessionId, points: 195, commandId: guestScore })
    await httpsCallable(host.functions, 'recordScore')({ sessionId, points: 185, commandId: hostCrossing })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ winnerUid: host.auth.currentUser!.uid, winningScoreCommandId: hostCrossing })
    const reportId = '123e4567-e89b-42d3-a456-426614174118'
    await httpsCallable(host.functions, 'reportScore')({ sessionId, scoreOwnerUid: guest.auth.currentUser!.uid, scoreEntryId: guestScore, reason: 'Debe incluir bono', commandId: reportId })
    await httpsCallable(guest.functions, 'resolveScoreReport')({ sessionId, reportId, outcome: 'accepted', correctedScore: 200, commandId: '123e4567-e89b-42d3-a456-426614174119' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active', winnerUid: guest.auth.currentUser!.uid, winningScoreCommandId: guestScore, winningTotalScore: 200 })
  })

  it('replays an active correction that moves the same winner to a later crossing', { timeout: 15_000 }, async () => {
    const { host, guest, sessionId, scoreEntryId } = await activeSession()
    const firstCrossing = '123e4567-e89b-42d3-a456-426614174120'; const laterCrossing = '123e4567-e89b-42d3-a456-426614174121'
    await httpsCallable(host.functions, 'recordScore')({ sessionId, points: 185, commandId: firstCrossing })
    await httpsCallable(host.functions, 'recordScore')({ sessionId, points: 15, commandId: laterCrossing })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ winnerUid: host.auth.currentUser!.uid, winningScoreCommandId: firstCrossing })
    const reportId = '123e4567-e89b-42d3-a456-426614174122'
    await httpsCallable(guest.functions, 'reportScore')({ sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'Puntuación inicial incorrecta', commandId: reportId })
    await httpsCallable(host.functions, 'resolveScoreReport')({ sessionId, reportId, outcome: 'accepted', correctedScore: 0, commandId: '123e4567-e89b-42d3-a456-426614174123' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'active', winnerUid: host.auth.currentUser!.uid, winningScoreCommandId: laterCrossing, winningTotalScore: 200 })
  })

  it('does not let report resolution reopen a finalized session, while preserving owner authorization and rejected-report audit history', { timeout: 15_000 }, async () => {
    const { host, guest, outsider, sessionId, scoreEntryId } = await activeSession()
    await httpsCallable(host.functions, 'recordScore')({ sessionId, points: 185, commandId: '123e4567-e89b-42d3-a456-426614174111' })
    const reportId = '123e4567-e89b-42d3-a456-426614174112'; const resolutionId = '123e4567-e89b-42d3-a456-426614174113'
    const input = { sessionId, scoreOwnerUid: host.auth.currentUser!.uid, scoreEntryId, reason: 'Revisar primera puntuación', commandId: reportId }
    await httpsCallable(guest.functions, 'reportScore')(input)
    await finalizeForGuard(sessionId)
    const resolve = httpsCallable(host.functions, 'resolveScoreReport')
    await expect(httpsCallable(guest.functions, 'resolveScoreReport')({ sessionId, reportId, outcome: 'accepted', correctedScore: 0, commandId: resolutionId })).rejects.toMatchObject({ details: { reason: 'not-score-owner' } })
    await expect(httpsCallable(outsider.functions, 'resolveScoreReport')({ sessionId, reportId, outcome: 'accepted', correctedScore: 0, commandId: resolutionId })).rejects.toMatchObject({ details: { reason: 'not-session-member' } })
    const accepted = { sessionId, reportId, outcome: 'accepted', correctedScore: 0, reason: 'Corregido', commandId: resolutionId }
    await expect(resolve(accepted)).rejects.toMatchObject({ details: { reason: 'session-finalized' } })
    await expect(resolve(accepted)).rejects.toMatchObject({ details: { reason: 'session-finalized' } })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'finished', winnerUid: host.auth.currentUser!.uid, winningTotalScore: 200 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'players', host.auth.currentUser!.uid))).data()).toMatchObject({ totalScore: 200 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReports', reportId))).data()).toMatchObject({ status: 'open' })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreCorrections', resolutionId))).exists()).toBe(false)
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReportResolutions', resolutionId))).exists()).toBe(false)
    const rejectionId = '123e4567-e89b-42d3-a456-426614174114'
    const rejected = { sessionId, reportId, outcome: 'rejected', reason: 'Resultado final confirmado', commandId: rejectionId }
    await expect(resolve(rejected)).resolves.toMatchObject({ data: { outcome: 'rejected' } })
    await expect(resolve(rejected)).resolves.toMatchObject({ data: { outcome: 'rejected' } })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId))).data()).toMatchObject({ status: 'finished', winnerUid: host.auth.currentUser!.uid, openScoreReportCount: 0 })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReports', reportId))).data()).toMatchObject({ status: 'resolved', resolutionCommandId: rejectionId })
    expect((await getDoc(doc(host.firestore, 'sessions', sessionId, 'scoreReportResolutions', rejectionId))).data()).toMatchObject({ outcome: 'rejected' })
    expect((await getDocs(collection(host.firestore, 'sessions', sessionId, 'scoreCorrections'))).size).toBe(0)
  })
})
