import { describe, expect, it } from 'vitest'

import { startSessionRecord, validateStartSessionInput } from '../src/startSession.js'

function firestoreFor(session: Record<string, unknown> | undefined, updates: Record<string, unknown>[]) {
  const reference = { id: 'session-1' }
  return {
    collection: () => ({ doc: () => reference }),
    runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      get: async () => ({ exists: session !== undefined, data: () => session }),
      update: (_reference: unknown, update: Record<string, unknown>) => updates.push(update),
    }),
  }
}

const lobby = {
  hostUid: 'host', status: 'lobby', maxPlayers: 4, playerCount: 2, playerNameKeys: ['host', 'guest'],
}

describe('startSession', () => {
  it('strictly accepts only a structurally safe session ID', () => {
    expect(validateStartSessionInput({ sessionId: ' session_1-ABC ' })).toEqual({ sessionId: 'session_1-ABC' })
    for (const value of ['', 'sessions/other', '../other', 3, undefined]) {
      expect(() => validateStartSessionInput({ sessionId: value })).toThrow()
    }
    expect(() => validateStartSessionInput({ sessionId: 'session-1', hostUid: 'spoofed' })).toThrow()
  })

  it('starts a valid two-to-four-player lobby exactly once', async () => {
    const updates: Record<string, unknown>[] = []
    const result = await startSessionRecord(firestoreFor(lobby, updates) as never, 'host', { sessionId: 'session-1' })
    expect(result).toEqual({ sessionId: 'session-1', status: 'active', playerCount: 2 })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ status: 'active', startedAt: expect.anything(), updatedAt: expect.anything() })
  })

  it('rejects missing, non-host, undersized, and corrupt sessions without updates', async () => {
    for (const [session, uid] of [
      [undefined, 'host'],
      [lobby, 'guest'],
      [{ ...lobby, playerCount: 1, playerNameKeys: ['host'] }, 'host'],
      [{ ...lobby, playerCount: 5, playerNameKeys: ['a', 'b', 'c', 'd', 'e'] }, 'host'],
      [{ ...lobby, playerCount: 2.5 }, 'host'],
      [{ ...lobby, status: 'future' }, 'host'],
    ] as const) {
      const updates: Record<string, unknown>[] = []
      await expect(startSessionRecord(firestoreFor(session, updates) as never, uid, { sessionId: 'session-1' })).rejects.toThrow()
      expect(updates).toHaveLength(0)
    }
  })

  it('returns an already active host session without rewriting timestamps', async () => {
    const updates: Record<string, unknown>[] = []
    const result = await startSessionRecord(firestoreFor({ ...lobby, status: 'active' }, updates) as never, 'host', { sessionId: 'session-1' })
    expect(result).toEqual({ sessionId: 'session-1', status: 'active', playerCount: 2 })
    expect(updates).toHaveLength(0)
  })
})
