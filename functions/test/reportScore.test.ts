import { describe, expect, it } from 'vitest'

import { reportScoreRecord, validateReportScoreInput } from '../src/reportScore.js'

const commandId = '123e4567-e89b-42d3-a456-426614174000'
const reportId = '123e4567-e89b-42d3-a456-426614174001'
const session = { hostUid: 'host', status: 'active', nextScoreSequence: 2 }
const score = { playerUid: 'owner', points: 15, sequence: 1, createdAt: { seconds: 1 } }

function firestoreFor(values: Record<string, unknown>, writes: Array<{ kind: string; value: Record<string, unknown> }>) {
  const openReportsQuery = { kind: 'openReports', where: () => openReportsQuery }
  const collection = (name: string) => ({
    doc: (id: string) => reference(name === 'players' ? 'players' : name === 'scoreEntries' ? 'entry' : name === 'scoreReports' ? 'report' : 'open', id),
    where: () => openReportsQuery,
  })
  const reference = (kind: string, id = '') => ({ kind, id, collection })
  return {
    collection: (name: string) => ({ doc: (id: string) => reference(name === 'sessions' ? 'session' : name, id) }),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      get: async (ref: { kind: string }) => ref.kind === 'openReports'
        ? { docs: (values.openReports as Array<{ id: string, data: Record<string, unknown> }> | undefined ?? []).map((report) => ({ id: report.id, data: () => report.data })) }
        : { exists: values[ref.kind] !== undefined, data: () => values[ref.kind] },
      create: (ref: { kind: string }, value: Record<string, unknown>) => writes.push({ kind: ref.kind, value }),
    }),
  }
}

describe('reportScore', () => {
  it('validates required reason, target identity, command identity, and optional correction score', () => {
    expect(validateReportScoreInput({ sessionId: ' session_1 ', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: ' Incorrect total ', commandId: reportId })).toMatchObject({ sessionId: 'session_1', reason: 'Incorrect total' })
    expect(validateReportScoreInput({ sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Wrong', proposedPoints: 0, commandId: reportId }).proposedPoints).toBe(0)
    expect(validateReportScoreInput({ sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Wrong', proposedPoints: 20, commandId: reportId }).proposedPoints).toBe(20)
    for (const proposedPoints of [-5, 7, 2.5]) expect(() => validateReportScoreInput({ sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Wrong', proposedPoints, commandId: reportId })).toThrow()
    for (const reason of ['', '   ', 'x'.repeat(281)]) expect(() => validateReportScoreInput({ sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason, commandId: reportId })).toThrow()
  })

  it('creates immutable report and open lock without changing session or score', async () => {
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = []
    const result = await reportScoreRecord(firestoreFor({ session, players: { displayName: 'Reporter' }, entry: score }, writes) as never, 'reporter', { sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Incorrect', proposedPoints: 0, commandId: reportId })
    expect(result).toEqual({ sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, commandId: reportId, status: 'open' })
    expect(writes).toHaveLength(2)
    expect(writes[0]).toMatchObject({ kind: 'report', value: { reporterUid: 'reporter', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Incorrect', proposedPoints: 0, status: 'open' } })
    expect(writes[1]).toMatchObject({ kind: 'open', value: { reportId } })
  })

  it('replays an exact command and rejects self reports, missing scores, conflicts, and a second open report', async () => {
    const input = { sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Incorrect', commandId: reportId }
    const existing = { commandId: reportId, reporterUid: 'reporter', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Incorrect', status: 'open', createdAt: { seconds: 1 } }
    const lock = { reportId, scoreOwnerUid: 'owner', scoreEntryId: commandId, createdAt: { seconds: 1 } }
    await expect(reportScoreRecord(firestoreFor({ session, players: {}, entry: score, report: existing, open: lock, openReports: [{ id: reportId, data: existing }] }, []) as never, 'reporter', input)).resolves.toMatchObject({ status: 'open' })
    await expect(reportScoreRecord(firestoreFor({ session, players: {}, entry: score }, []) as never, 'owner', input)).rejects.toThrow()
    await expect(reportScoreRecord(firestoreFor({ session, players: {} }, []) as never, 'reporter', input)).rejects.toThrow()
    await expect(reportScoreRecord(firestoreFor({ session, players: {}, entry: score, open: { reportId: 'other' }, openReports: [{ id: 'other', data: { ...existing, commandId: 'other' } }] }, []) as never, 'other', { ...input, commandId: '123e4567-e89b-42d3-a456-426614174002' })).rejects.toThrow()
    await expect(reportScoreRecord(firestoreFor({ session, players: {}, entry: score, report: { ...existing, reason: 'Different' }, open: lock, openReports: [{ id: reportId, data: existing }] }, []) as never, 'reporter', input)).rejects.toThrow()
  })

  it('fails closed for a mismatched command ID or an open report without its canonical lock', async () => {
    const input = { sessionId: 'session-1', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Incorrect', commandId: reportId }
    const existing = { commandId: '123e4567-e89b-42d3-a456-426614174003', reporterUid: 'reporter', scoreOwnerUid: 'owner', scoreEntryId: commandId, reason: 'Incorrect', status: 'open', createdAt: { seconds: 1 } }
    await expect(reportScoreRecord(firestoreFor({ session, players: {}, entry: score, report: existing, openReports: [{ id: reportId, data: existing }] }, []) as never, 'reporter', input)).rejects.toThrow()
    const otherOpen = { ...existing, commandId: '123e4567-e89b-42d3-a456-426614174004' }
    await expect(reportScoreRecord(firestoreFor({ session, players: {}, entry: score, openReports: [{ id: otherOpen.commandId, data: otherOpen }] }, []) as never, 'other', { ...input, commandId: '123e4567-e89b-42d3-a456-426614174005' })).rejects.toThrow()
  })
})
