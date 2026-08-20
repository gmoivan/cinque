import { describe, expect, it } from 'vitest'

import { recordScoreRecord, validateRecordScoreInput } from '../src/recordScore.js'

const activeSession = {
  hostUid: 'host', status: 'active', targetScore: 200, maxPlayers: 4, playerCount: 2, playerNameKeys: ['host', 'guest'], nextScoreSequence: 3,
}
const player = { displayName: 'Host', totalScore: 20 }
const commandId = '123e4567-e89b-42d3-a456-426614174000'

function firestoreFor(session: Record<string, unknown> | undefined, membership: Record<string, unknown> | undefined, entry: Record<string, unknown> | undefined, writes: Array<{ kind: string; value: Record<string, unknown> }>, ledger: Record<string, unknown>[] = [{ sequence: 1 }, { sequence: 2 }]) {
  const playerReference = {
    id: 'host', kind: 'player',
    collection: () => ({ kind: 'entries', doc: (entryId: string) => ({ id: entryId, kind: 'entry' }) }),
  }
  const sessionReference = {
    id: 'session-1', kind: 'session',
    collection: () => ({ kind: 'players', doc: () => playerReference }),
  }
  return {
    collection: () => ({ doc: () => sessionReference }),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      get: async (reference: { kind: string }) => {
        if (reference.kind === 'players') return { docs: [{ ref: playerReference }] }
        if (reference.kind === 'entries') return { docs: ledger.map((data) => ({ data: () => data })) }
        const data = reference.kind === 'session' ? session : reference.kind === 'player' ? membership : entry
        return { exists: data !== undefined, data: () => data }
      },
      create: (_reference: unknown, value: Record<string, unknown>) => writes.push({ kind: 'create', value }),
      update: (_reference: unknown, value: Record<string, unknown>) => writes.push({ kind: 'update', value }),
    }),
  }
}

describe('recordScore', () => {
  it('strictly validates session ID, positive five-point integers, and UUID command IDs', () => {
    expect(validateRecordScoreInput({ sessionId: ' session_1 ', points: 25, commandId })).toEqual({ sessionId: 'session_1', points: 25, commandId })
    for (const points of [0, -5, 7, 2.5, Number.NaN, Infinity, '25']) {
      expect(() => validateRecordScoreInput({ sessionId: 'session-1', points, commandId })).toThrow()
    }
    for (const id of ['not-a-uuid', '123e4567-e89b-42d3-a456-426614174000/path', '123e4567-e89b-62d3-a456-426614174000']) {
      expect(() => validateRecordScoreInput({ sessionId: 'session-1', points: 5, commandId: id })).toThrow()
    }
    expect(() => validateRecordScoreInput({ sessionId: 'session-1', points: 5, commandId, playerUid: 'spoofed' })).toThrow()
  })

  it('creates one immutable entry and updates only the caller total', async () => {
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = []
    const result = await recordScoreRecord(firestoreFor(activeSession, player, undefined, writes) as never, 'host', { sessionId: 'session-1', points: 15, commandId })
    expect(result).toEqual({ sessionId: 'session-1', points: 15, totalScore: 35, commandId, sequence: 3 })
    expect(writes).toHaveLength(3)
    expect(writes[0]).toMatchObject({ kind: 'create', value: { points: 15, playerUid: 'host', sequence: 3, createdAt: expect.anything() } })
    expect(writes[1]).toEqual({ kind: 'update', value: { totalScore: 35 } })
    expect(writes[2]).toEqual({ kind: 'update', value: { nextScoreSequence: 4 } })
  })

  it('detects a first target-crossing winner while keeping the session active', async () => {
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = []
    const crossingPlayer = { displayName: 'Guest', totalScore: 195 }
    const result = await recordScoreRecord(firestoreFor(activeSession, crossingPlayer, undefined, writes) as never, 'guest', { sessionId: 'session-1', points: 10, commandId })

    expect(result).toMatchObject({ totalScore: 205, sequence: 3, winnerUid: 'guest', winningTotalScore: 205, winningScoreCommandId: commandId })
    expect(writes).toHaveLength(3)
    expect(writes[1]).toEqual({ kind: 'update', value: { totalScore: 205 } })
    expect(writes[2]).toMatchObject({ kind: 'update', value: { nextScoreSequence: 4, winnerUid: 'guest', winningScoreCommandId: commandId, winningTotalScore: 205, winnerDetectedAt: expect.anything() } })
    expect(activeSession.status).toBe('active')
  })

  it('continues ordinary scoring after winner detection without replacing the first winner', async () => {
    const winnerSession = { ...activeSession, winnerUid: 'guest', winnerDetectedAt: { toDate: () => new Date() }, winningScoreCommandId: commandId, winningTotalScore: 200 }
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = []
    const laterId = '123e4567-e89b-42d3-a456-426614174005'
    await expect(recordScoreRecord(firestoreFor(winnerSession, { ...player, totalScore: 195 }, undefined, writes) as never, 'host', { sessionId: 'session-1', points: 10, commandId: laterId })).resolves.toMatchObject({ totalScore: 205, winnerUid: 'guest', winningScoreCommandId: commandId })
    expect(writes).toHaveLength(3)
    expect(writes[2]).toEqual({ kind: 'update', value: { nextScoreSequence: 4 } })
  })

  it('leaves winner fields absent below target and fails closed for malformed winner metadata', async () => {
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = []
    await expect(recordScoreRecord(firestoreFor(activeSession, { ...player, totalScore: 190 }, undefined, writes) as never, 'host', { sessionId: 'session-1', points: 5, commandId })).resolves.toMatchObject({ totalScore: 195 })
    expect(writes).toHaveLength(3)
    await expect(recordScoreRecord(firestoreFor({ ...activeSession, winnerUid: 'host' }, player, undefined, []) as never, 'host', { sessionId: 'session-1', points: 5, commandId })).rejects.toThrow()
    await expect(recordScoreRecord(firestoreFor({ ...activeSession, winnerUid: 'host', winnerDetectedAt: { toDate: () => new Date() }, winningScoreCommandId: commandId, winningTotalScore: 199 }, player, undefined, []) as never, 'host', { sessionId: 'session-1', points: 5, commandId })).rejects.toThrow()
  })

  it('rejects new scores after finish while preserving exact winning retries', async () => {
    const winnerSession = {
      ...activeSession,
      status: 'finished',
      winnerUid: 'guest',
      winnerDetectedAt: { toDate: () => new Date() },
      winningScoreCommandId: commandId,
      winningTotalScore: 200,
    }
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = []
    const laterId = '123e4567-e89b-42d3-a456-426614174005'
    await expect(recordScoreRecord(firestoreFor(winnerSession, player, undefined, writes) as never, 'host', { sessionId: 'session-1', points: 5, commandId: laterId })).rejects.toThrow()
    expect(writes).toHaveLength(0)
    const retries: Array<{ kind: string; value: Record<string, unknown> }> = []
    const existing = { points: 5, playerUid: 'guest', sequence: 3, createdAt: { seconds: 1 } }
    await expect(recordScoreRecord(firestoreFor({ ...winnerSession, nextScoreSequence: 4 }, { displayName: 'Guest', totalScore: 200 }, existing, retries, [{ sequence: 1 }, { sequence: 2 }, existing]) as never, 'guest', { sessionId: 'session-1', points: 5, commandId })).resolves.toMatchObject({ totalScore: 200, winnerUid: 'guest', winningTotalScore: 200, winningScoreCommandId: commandId })
    expect(retries).toHaveLength(0)
  })

  it('makes exact retries no-ops and rejects missing membership, inactive sessions, malformed state, and conflicts', async () => {
    const existing = { points: 10, playerUid: 'host', sequence: 3, createdAt: { seconds: 1 } }
    const retries: Array<{ kind: string; value: Record<string, unknown> }> = []
    await expect(recordScoreRecord(firestoreFor({ ...activeSession, nextScoreSequence: 4 }, player, existing, retries, [{ sequence: 1 }, { sequence: 2 }, existing]) as never, 'host', { sessionId: 'session-1', points: 10, commandId })).resolves.toMatchObject({ totalScore: 20 })
    expect(retries).toHaveLength(0)
    for (const [session, membership, entry, points] of [
      [{ ...activeSession, status: 'lobby' }, player, undefined, 5],
      [activeSession, undefined, undefined, 5],
      [{ ...activeSession, playerCount: 2.5 }, player, undefined, 5],
      [activeSession, player, existing, 15],
    ] as const) {
      await expect(recordScoreRecord(firestoreFor(session, membership, entry, []) as never, 'host', { sessionId: 'session-1', points, commandId })).rejects.toThrow()
    }
  })

  it('retains a stored sequence for exact retries and rejects malformed sequence state', async () => {
    const existing = { points: 10, playerUid: 'host', sequence: 2, createdAt: { seconds: 1 } }
    await expect(recordScoreRecord(firestoreFor({ ...activeSession, nextScoreSequence: 3 }, player, existing, [], [{ sequence: 1 }, existing]) as never, 'host', { sessionId: 'session-1', points: 10, commandId })).resolves.toMatchObject({ sequence: 2 })
    await expect(recordScoreRecord(firestoreFor({ ...activeSession, nextScoreSequence: 0 }, player, undefined, []) as never, 'host', { sessionId: 'session-1', points: 10, commandId })).rejects.toThrow()
    await expect(recordScoreRecord(firestoreFor(activeSession, player, { ...existing, sequence: 0 }, []) as never, 'host', { sessionId: 'session-1', points: 10, commandId })).rejects.toThrow()
  })

  it.each([
    [[{ sequence: 1 }, { sequence: 2 }], { ...activeSession, nextScoreSequence: 2 }],
    [[{ sequence: 1 }, { sequence: 2 }], { ...activeSession, nextScoreSequence: 4 }],
    [[{ sequence: 1 }, { sequence: 1 }], activeSession],
    [[{ sequence: 1 }, { sequence: 3 }], activeSession],
    [[{ sequence: 1 }, { sequence: 0 }], activeSession],
  ])('rejects a corrupt persisted score ledger before allocating a new sequence', async (ledger, session) => {
    await expect(recordScoreRecord(firestoreFor(session, player, undefined, [], ledger) as never, 'host', { sessionId: 'session-1', points: 5, commandId })).rejects.toThrow()
  })

  it('fails closed on an exact replay when its persisted ledger is corrupt', async () => {
    const existing = { points: 10, playerUid: 'host', sequence: 2, createdAt: { seconds: 1 } }
    await expect(recordScoreRecord(firestoreFor(activeSession, player, existing, [], [{ sequence: 1 }, { ...existing, sequence: 1 }]) as never, 'host', { sessionId: 'session-1', points: 10, commandId })).rejects.toThrow()
  })
})
