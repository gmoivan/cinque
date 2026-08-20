import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/https'

import { isValidScoreValue } from './recordScore.js'
import { validateSafeSessionId } from './sessionValidation.js'

const commandIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maximumReasonLength = 280

export interface ValidResolveScoreReportInput { readonly sessionId: string; readonly reportId: string; readonly outcome: 'accepted' | 'rejected'; readonly correctedScore?: number; readonly reason?: string; readonly commandId: string }
export interface ResolvedScoreReport { readonly sessionId: string; readonly reportId: string; readonly commandId: string; readonly outcome: 'accepted' | 'rejected'; readonly correctedScore?: number }
type ResolveOutcome = 'not-session-member' | 'report-not-found' | 'not-score-owner' | 'session-finalized' | 'already-resolved' | 'idempotency-conflict'

function failure(reason: ResolveOutcome): HttpsError { return new HttpsError(reason === 'not-session-member' || reason === 'not-score-owner' ? 'permission-denied' : 'failed-precondition', 'Score report cannot be resolved.', { reason }) }
function unavailable(): HttpsError { return new HttpsError('unavailable', 'Score report resolution is temporarily unavailable.') }
function command(value: unknown): string { if (typeof value !== 'string' || !commandIdPattern.test(value)) throw new HttpsError('invalid-argument', 'Invalid score report resolution.'); return value }
function reason(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Invalid score report resolution.')
  const normalized = value.trim()
  if (Array.from(normalized).length === 0 || Array.from(normalized).length > maximumReasonLength || /[\p{Cc}\p{Cf}]/u.test(normalized) || !/\S/u.test(normalized)) throw new HttpsError('invalid-argument', 'Invalid score report resolution.')
  return normalized
}
export function validateResolveScoreReportInput(input: unknown): ValidResolveScoreReportInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Invalid score report resolution.')
  const data = input as Record<string, unknown>; const allowed = ['sessionId', 'reportId', 'outcome', 'correctedScore', 'reason', 'commandId']
  if (!Object.keys(data).every((key) => allowed.includes(key)) || !('sessionId' in data) || !('reportId' in data) || !('outcome' in data) || !('commandId' in data)) throw new HttpsError('invalid-argument', 'Invalid score report resolution.')
  if (data.outcome !== 'accepted' && data.outcome !== 'rejected') throw new HttpsError('invalid-argument', 'Invalid score report resolution.')
  if ((data.outcome === 'accepted' && !isValidScoreValue(data.correctedScore, true)) || (data.outcome === 'rejected' && ('correctedScore' in data && data.correctedScore !== undefined))) throw new HttpsError('invalid-argument', 'Invalid score report resolution.')
  return { sessionId: validateSafeSessionId(data.sessionId), reportId: command(data.reportId), outcome: data.outcome, ...(data.outcome === 'accepted' ? { correctedScore: data.correctedScore as number } : {}), ...(reason(data.reason) === undefined ? {} : { reason: reason(data.reason) }), commandId: command(data.commandId) }
}
function timestamp(value: unknown): boolean { return typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function' }
type Winner = { uid: string; commandId: string; total: number }
function winnerState(data: DocumentData): 'none' | 'detected' | 'invalid' { const values = [data.winnerUid, data.winnerDetectedAt, data.winningScoreCommandId, data.winningTotalScore]; if (values.every((value) => value === undefined)) return 'none'; if (values.some((value) => value === undefined)) return 'invalid'; return typeof data.winnerUid === 'string' && data.winnerUid.length > 0 && timestamp(data.winnerDetectedAt) && commandIdPattern.test(data.winningScoreCommandId) && Number.isSafeInteger(data.winningTotalScore) && data.winningTotalScore >= data.targetScore ? 'detected' : 'invalid' }
function validSession(data: DocumentData): boolean { const state = winnerState(data); return typeof data.hostUid === 'string' && Number.isInteger(data.targetScore) && data.targetScore >= 200 && data.targetScore <= 1000 && data.targetScore % 5 === 0 && Number.isSafeInteger(data.nextScoreSequence) && data.nextScoreSequence >= 1 && Number.isSafeInteger(data.openScoreReportCount) && data.openScoreReportCount >= 0 && ((data.status === 'active' && (state === 'none' || state === 'detected')) || (data.status === 'finished' && state === 'detected')) }
function validPlayer(data: DocumentData): boolean { return typeof data.displayName === 'string' && data.displayName.length > 0 && Number.isSafeInteger(data.totalScore) && data.totalScore >= 0 }
function validReport(data: DocumentData): boolean { return typeof data.commandId === 'string' && typeof data.reporterUid === 'string' && typeof data.scoreOwnerUid === 'string' && commandIdPattern.test(data.scoreEntryId) && typeof data.reason === 'string' && data.createdAt !== undefined && (data.status === 'open' || (data.status === 'resolved' && commandIdPattern.test(data.resolutionCommandId))) }
function validLock(data: DocumentData, report: DocumentData): boolean { return data.reportId === report.commandId && data.scoreOwnerUid === report.scoreOwnerUid && data.scoreEntryId === report.scoreEntryId && data.createdAt !== undefined }
function validResolution(data: DocumentData, input: ValidResolveScoreReportInput, report: DocumentData, uid: string): boolean { return data.commandId === input.commandId && data.reportId === input.reportId && data.resolverUid === uid && data.scoreEntryId === report.scoreEntryId && data.scoreOwnerUid === report.scoreOwnerUid && data.outcome === input.outcome && data.correctedScore === input.correctedScore && data.reason === input.reason && data.createdAt !== undefined }
function ordering(entries: readonly DocumentData[], next: unknown): boolean { if (!Number.isSafeInteger(next) || next !== entries.length + 1) return false; const seen = new Set<number>(); return entries.every((entry) => Number.isSafeInteger(entry.sequence) && entry.sequence >= 1 && !seen.has(entry.sequence) && (seen.add(entry.sequence), true)) && [...Array(entries.length)].every((_, index) => seen.has(index + 1)) }
function validCorrection(data: DocumentData, entries: Map<string, DocumentData>): boolean { const entry = entries.get(`${data.scoreOwnerUid}/${data.scoreEntryId}`); return typeof data.reportId === 'string' && typeof data.scoreOwnerUid === 'string' && commandIdPattern.test(data.scoreEntryId) && isValidScoreValue(data.correctedScore, true) && Number.isSafeInteger(data.revision) && data.revision >= 1 && typeof data.appliedByUid === 'string' && data.createdAt !== undefined && !!entry && entry.playerUid === data.scoreOwnerUid }
function derived(entries: readonly DocumentData[], corrections: readonly DocumentData[], playerIds: readonly string[], target: number) {
  const byEntry = new Map<string, DocumentData[]>(); for (const correction of corrections) { const key = `${correction.scoreOwnerUid}/${correction.scoreEntryId}`; byEntry.set(key, [...(byEntry.get(key) ?? []), correction]) }
  const effective = new Map<string, number>(); for (const [key, values] of byEntry) { const revisions = values.map((value) => value.revision).sort((a, b) => a - b); if (revisions.some((value, index) => value !== index + 1)) throw unavailable(); effective.set(key, values.reduce((latest, value) => value.revision > latest.revision ? value : latest).correctedScore) }
  const totals = new Map(playerIds.map((id) => [id, 0])); let winner: Winner | undefined
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) { const points = effective.get(`${entry.playerUid}/${entry.id}`) ?? entry.points; const total = (totals.get(entry.playerUid) ?? -1) + points; if (!Number.isSafeInteger(total) || total < 0) throw unavailable(); totals.set(entry.playerUid, total); if (!winner && total >= target) winner = { uid: entry.playerUid, commandId: entry.id, total } }
  return { totals, winner }
}
function sameWinner(session: DocumentData, winner: Winner | undefined): boolean { return !!winner && session.winnerUid === winner.uid && session.winningScoreCommandId === winner.commandId && session.winningTotalScore === winner.total && timestamp(session.winnerDetectedAt) }

export async function resolveScoreReportRecord(firestore: Firestore, uid: string, input: ValidResolveScoreReportInput): Promise<ResolvedScoreReport> {
  return firestore.runTransaction(async (transaction) => {
    const sessionRef = firestore.collection('sessions').doc(input.sessionId); const playerRef = sessionRef.collection('players').doc(uid); const reportRef = sessionRef.collection('scoreReports').doc(input.reportId); const resolutionRef = sessionRef.collection('scoreReportResolutions').doc(input.commandId)
    const openReportsQuery = sessionRef.collection('scoreReports').where('status', '==', 'open')
    const [sessionSnap, playerSnap, reportSnap, resolutionSnap, playersSnap, correctionsSnap, openReportsSnap] = await Promise.all([transaction.get(sessionRef), transaction.get(playerRef), transaction.get(reportRef), transaction.get(resolutionRef), transaction.get(sessionRef.collection('players')), transaction.get(sessionRef.collection('scoreCorrections')), transaction.get(openReportsQuery)])
    const entrySnaps = await Promise.all(playersSnap.docs.map((player) => transaction.get(player.ref.collection('scoreEntries'))))
    if (!sessionSnap.exists || !sessionSnap.data() || !validSession(sessionSnap.data()!)) throw unavailable(); const session = sessionSnap.data()!
    if (openReportsSnap.size !== session.openScoreReportCount) throw unavailable()
    if (!playerSnap.exists) throw failure('not-session-member'); if (!reportSnap.exists || !reportSnap.data() || !validReport(reportSnap.data()!)) throw failure('report-not-found'); const report = reportSnap.data()!
    const entries: Array<DocumentData & { id: string }> = entrySnaps.flatMap((snapshot) => snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }))); const entryMap = new Map<string, DocumentData>(entries.map((entry) => [`${entry.playerUid}/${entry.id}`, entry])); const players = playersSnap.docs.map((player) => ({ id: player.id, data: player.data(), ref: player.ref }))
    if (players.some((player) => !validPlayer(player.data)) || !ordering(entries, session.nextScoreSequence) || !entryMap.has(`${report.scoreOwnerUid}/${report.scoreEntryId}`)) throw unavailable()
    const target = entryMap.get(`${report.scoreOwnerUid}/${report.scoreEntryId}`)!; if (target.playerUid !== report.scoreOwnerUid) throw unavailable(); if (uid !== target.playerUid) throw failure('not-score-owner')
    const corrections = correctionsSnap.docs.map((correction) => correction.data()); if (corrections.some((correction) => !validCorrection(correction, entryMap))) throw unavailable()
    const before = derived(entries, corrections, players.map((player) => player.id), session.targetScore); if (players.some((player) => before.totals.get(player.id) !== player.data.totalScore) || (before.winner ? !sameWinner(session, before.winner) : winnerState(session) !== 'none')) throw unavailable()
    if (resolutionSnap.exists) { const resolution = resolutionSnap.data(); if (!resolution || !validResolution(resolution, input, report, uid) || report.status !== 'resolved' || report.resolutionCommandId !== input.commandId) throw failure('idempotency-conflict'); if (input.outcome === 'accepted') { const correction = correctionsSnap.docs.find((value) => value.id === input.commandId)?.data(); if (!correction || correction.reportId !== input.reportId || correction.correctedScore !== input.correctedScore) throw unavailable() }; return { sessionId: input.sessionId, reportId: input.reportId, commandId: input.commandId, outcome: input.outcome, ...(input.outcome === 'accepted' ? { correctedScore: input.correctedScore } : {}) } }
    if (report.status !== 'open') throw failure('already-resolved')
    if (session.status === 'finished' && input.outcome === 'accepted') throw failure('session-finalized')
    if (session.openScoreReportCount < 1) throw unavailable()
    const lockRef = sessionRef.collection('openScoreReports').doc(`${report.scoreOwnerUid}_${report.scoreEntryId}`); const lockSnap = await transaction.get(lockRef); if (!lockSnap.exists || !lockSnap.data() || !validLock(lockSnap.data()!, report)) throw unavailable()
    transaction.create(resolutionRef, { commandId: input.commandId, reportId: input.reportId, resolverUid: uid, scoreEntryId: report.scoreEntryId, scoreOwnerUid: report.scoreOwnerUid, outcome: input.outcome, ...(input.outcome === 'accepted' ? { correctedScore: input.correctedScore } : {}), ...(input.reason === undefined ? {} : { reason: input.reason }), createdAt: FieldValue.serverTimestamp() })
    transaction.update(reportRef, { status: 'resolved', resolutionCommandId: input.commandId }); transaction.delete(lockRef); transaction.update(sessionRef, { openScoreReportCount: session.openScoreReportCount - 1 })
    if (input.outcome === 'accepted') { const revision = corrections.filter((correction) => correction.scoreOwnerUid === report.scoreOwnerUid && correction.scoreEntryId === report.scoreEntryId).length + 1; const next = [...corrections, { scoreOwnerUid: report.scoreOwnerUid, scoreEntryId: report.scoreEntryId, correctedScore: input.correctedScore, revision, reportId: input.reportId, appliedByUid: uid }]; const after = derived(entries, next, players.map((player) => player.id), session.targetScore); transaction.create(sessionRef.collection('scoreCorrections').doc(input.commandId), { commandId: input.commandId, reportId: input.reportId, scoreEntryId: report.scoreEntryId, scoreOwnerUid: report.scoreOwnerUid, correctedScore: input.correctedScore, revision, appliedByUid: uid, createdAt: FieldValue.serverTimestamp() }); for (const player of players) transaction.update(player.ref, { totalScore: after.totals.get(player.id) })
      if (after.winner) transaction.update(sessionRef, { winnerUid: after.winner.uid, winningScoreCommandId: after.winner.commandId, winningTotalScore: after.winner.total, ...(sameWinner(session, after.winner) ? {} : { winnerDetectedAt: FieldValue.serverTimestamp() }) }); else transaction.update(sessionRef, { winnerUid: FieldValue.delete(), winnerDetectedAt: FieldValue.delete(), winningScoreCommandId: FieldValue.delete(), winningTotalScore: FieldValue.delete() }) }
    return { sessionId: input.sessionId, reportId: input.reportId, commandId: input.commandId, outcome: input.outcome, ...(input.outcome === 'accepted' ? { correctedScore: input.correctedScore } : {}) }
  })
}
