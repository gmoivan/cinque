import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<(snapshot: { docs: Array<{ id: string; ref: unknown }> }) => void>,
  errors: [] as Array<() => void>,
  unsubscribes: [] as ReturnType<typeof vi.fn>[],
}))

vi.mock('firebase/firestore', () => ({
  collection: (...parts: unknown[]) => ({ kind: 'collection', parts }),
  doc: (...parts: unknown[]) => ({ kind: 'doc', parts }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn((_reference: unknown, next: (snapshot: { docs: Array<{ id: string; ref: unknown }> }) => void, error: () => void) => {
    const unsubscribe = vi.fn()
    mocks.callbacks.push(next)
    mocks.errors.push(error)
    mocks.unsubscribes.push(unsubscribe)
    return unsubscribe
  }),
}))

vi.mock('../../infrastructure/firebase/config', () => ({ firebaseFirestore: {}, firebaseFunctions: {} }))

import { FirebaseSessionService } from '../../infrastructure/firebase/sessions'

beforeEach(() => {
  mocks.callbacks.length = 0
  mocks.errors.length = 0
  mocks.unsubscribes.length = 0
})

describe('session realtime subscription', () => {
  it('observes every session collection, adds player ledgers, and cleans up exactly once', async () => {
    const service = new FirebaseSessionService({} as never, {} as never)
    const value = { sessionId: 'session-1', code: 'ABC234', hostUid: 'host', status: 'lobby', targetScore: 200, playerCount: 1, totalScore: 0, players: [], scoreEntries: [] }
    vi.spyOn(service, 'getSession').mockResolvedValue(value)
    const onSession = vi.fn()
    const stop = service.subscribeToSession('session-1', 'host', onSession, vi.fn())
    expect(mocks.unsubscribes).toHaveLength(5)
    mocks.callbacks[4]({ docs: [{ id: 'host', ref: { path: 'players/host' } }] })
    await vi.waitFor(() => expect(onSession).toHaveBeenCalledWith(value))
    expect(mocks.unsubscribes).toHaveLength(6)
    stop()
    stop()
    expect(mocks.unsubscribes.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true)
  })

  it('terminates all listeners on a Firestore listener error', () => {
    const service = new FirebaseSessionService({} as never, {} as never)
    const onError = vi.fn()
    service.subscribeToSession('session-1', 'host', vi.fn(), onError)
    mocks.errors[0]()
    expect(onError).toHaveBeenCalledOnce()
    expect(mocks.unsubscribes.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true)
  })
})
