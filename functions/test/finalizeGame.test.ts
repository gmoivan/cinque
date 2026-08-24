import { describe, expect, it } from 'vitest'

import { finalizeGameRecord, validateFinalizeGameInput } from '../src/finalizeGame.js'

const commandId = '123e4567-e89b-42d3-a456-426614174200'
const winnerCommandId = '123e4567-e89b-42d3-a456-426614174201'
const activeWinner = { hostUid: 'host', status: 'active', targetScore: 200, nextScoreSequence: 3, openScoreReportCount: 0, winnerUid: 'host', winnerDetectedAt: { toDate: () => new Date() }, winningScoreCommandId: winnerCommandId, winningTotalScore: 200 }

function firestoreFor(session: Record<string, unknown> | undefined, writes: Record<string, unknown>[], openReportSize?: number) {
  const query = { kind: 'open-reports' }
  const playersQuery = { kind: 'players' }
  const reference = { id: 'session-1', collection: (name: string) => name === 'players' ? playersQuery : ({ where: () => query }) }
  return { collection: () => ({ doc: () => reference }), runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({ get: async (value: { kind?: string }) => {
    if (value.kind === 'open-reports') return { size: openReportSize ?? (typeof session?.openScoreReportCount === 'number' ? session.openScoreReportCount : 0) }
    if (value.kind === 'players') return { docs: [{ id: 'host', data: () => ({ totalScore: 200 }) }] }
    return { exists: session !== undefined, data: () => session }
  }, update: (_ref: unknown, value: Record<string, unknown>) => writes.push(value), set: (_ref: unknown, value: Record<string, unknown>) => writes.push(value) }) }
}

describe('finalizeGame', () => {
  it('strictly validates session and command IDs', () => {
    expect(validateFinalizeGameInput({ sessionId: ' session-1 ', commandId })).toEqual({ sessionId: 'session-1', commandId })
    expect(() => validateFinalizeGameInput({ sessionId: 'session-1', commandId: 'bad' })).toThrow()
    expect(() => validateFinalizeGameInput({ sessionId: 'session-1', commandId, winnerUid: 'host' })).toThrow()
  })

  it('allows only the host to atomically finalize an active detected winner without changing winner fields', async () => {
    const writes: Record<string, unknown>[] = []
    await expect(finalizeGameRecord(firestoreFor(activeWinner, writes) as never, 'host', { sessionId: 'session-1', commandId })).resolves.toEqual({ sessionId: 'session-1', status: 'finished', commandId, winnerUid: 'host', winningTotalScore: 200, winningScoreCommandId: winnerCommandId })
    expect(writes).toEqual([
      { status: 'finished', finalizationCommandId: commandId, finishedAt: expect.anything(), updatedAt: expect.anything() },
      expect.objectContaining({ stats: expect.anything() })
    ])
    await expect(finalizeGameRecord(firestoreFor(activeWinner, []) as never, 'guest', { sessionId: 'session-1', commandId })).rejects.toThrow()
  })

  it('fails closed without a complete winner and distinguishes finalized retries', async () => {
    await expect(finalizeGameRecord(firestoreFor({ ...activeWinner, winnerUid: undefined, winnerDetectedAt: undefined, winningScoreCommandId: undefined, winningTotalScore: undefined }, []) as never, 'host', { sessionId: 'session-1', commandId })).rejects.toMatchObject({ details: { reason: 'no-winner-detected' } })
    await expect(finalizeGameRecord(firestoreFor({ ...activeWinner, winnerDetectedAt: undefined }, []) as never, 'host', { sessionId: 'session-1', commandId })).rejects.toThrow()
    await expect(finalizeGameRecord(firestoreFor(undefined, []) as never, 'host', { sessionId: 'session-1', commandId })).rejects.toMatchObject({ details: { reason: 'session-not-found' } })
    const finished = { ...activeWinner, status: 'finished', finalizationCommandId: commandId, finishedAt: { toDate: () => new Date() } }
    await expect(finalizeGameRecord(firestoreFor(finished, []) as never, 'host', { sessionId: 'session-1', commandId })).resolves.toMatchObject({ status: 'finished', commandId })
    await expect(finalizeGameRecord(firestoreFor(finished, []) as never, 'host', { sessionId: 'session-1', commandId: '123e4567-e89b-42d3-a456-426614174202' })).rejects.toMatchObject({ details: { reason: 'session-finalized' } })
  })

  it('rejects open or corrupt report aggregates without lifecycle writes', async () => {
    const writes: Record<string, unknown>[] = []
    await expect(finalizeGameRecord(firestoreFor({ ...activeWinner, openScoreReportCount: 1 }, writes) as never, 'host', { sessionId: 'session-1', commandId })).rejects.toMatchObject({ details: { reason: 'open-score-reports' } })
    expect(writes).toHaveLength(0)
    await expect(finalizeGameRecord(firestoreFor(activeWinner, [], 1) as never, 'host', { sessionId: 'session-1', commandId })).rejects.toThrow()
    await expect(finalizeGameRecord(firestoreFor({ ...activeWinner, openScoreReportCount: -1 }, []) as never, 'host', { sessionId: 'session-1', commandId })).rejects.toThrow()
  })
})
