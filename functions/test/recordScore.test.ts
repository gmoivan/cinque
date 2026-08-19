import { describe, expect, it } from 'vitest'

import { recordScoreRecord, validateRecordScoreInput } from '../src/recordScore.js'

const activeSession = {
  hostUid: 'host', status: 'active', targetScore: 200, maxPlayers: 4, playerCount: 2, playerNameKeys: ['host', 'guest'],
}
const player = { displayName: 'Host', totalScore: 20 }
const commandId = '123e4567-e89b-42d3-a456-426614174000'

function firestoreFor(session: Record<string, unknown> | undefined, membership: Record<string, unknown> | undefined, entry: Record<string, unknown> | undefined, writes: Array<{ kind: string; value: Record<string, unknown> }>) {
  const sessionReference = {
    id: 'session-1',
    collection: () => ({ doc: (id: string) => ({ id, collection: () => ({ doc: (entryId: string) => ({ id: entryId }) }) }) }),
  }
  return {
    collection: () => ({ doc: () => sessionReference }),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      get: async (reference: { id: string }) => {
        const data = reference.id === 'session-1' ? session : reference.id === 'host' ? membership : entry
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
    expect(result).toEqual({ sessionId: 'session-1', points: 15, totalScore: 35, commandId })
    expect(writes).toHaveLength(2)
    expect(writes[0]).toMatchObject({ kind: 'create', value: { points: 15, playerUid: 'host', createdAt: expect.anything() } })
    expect(writes[1]).toEqual({ kind: 'update', value: { totalScore: 35 } })
  })

  it('makes exact retries no-ops and rejects missing membership, inactive sessions, malformed state, and conflicts', async () => {
    const existing = { points: 10, playerUid: 'host', createdAt: { seconds: 1 } }
    const retries: Array<{ kind: string; value: Record<string, unknown> }> = []
    await expect(recordScoreRecord(firestoreFor(activeSession, player, existing, retries) as never, 'host', { sessionId: 'session-1', points: 10, commandId })).resolves.toMatchObject({ totalScore: 20 })
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
})
