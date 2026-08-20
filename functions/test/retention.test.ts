import { Timestamp } from 'firebase-admin/firestore'
import { describe, expect, it, vi } from 'vitest'

import {
  anonymousSessionExpiration,
  anonymousSessionRetentionDays,
  cleanupExpiredSessionRecord,
  hasValidAnonymousRetentionMarker,
  isPersistentSignInProvider,
  validatePreserveSessionInput,
} from '../src/retention.js'

describe('session retention', () => {
  it('uses exactly thirty days and recognizes only non-anonymous providers as persistent', () => {
    const now = Date.UTC(2026, 7, 19)
    expect(anonymousSessionExpiration(now).toMillis() - now).toBe(anonymousSessionRetentionDays * 24 * 60 * 60 * 1000)
    expect(isPersistentSignInProvider({ firebase: { sign_in_provider: 'google.com' } })).toBe(true)
    expect(isPersistentSignInProvider({ firebase: { sign_in_provider: 'anonymous' } })).toBe(false)
    expect(isPersistentSignInProvider({})).toBe(false)
    expect(validatePreserveSessionInput({ sessionId: ' session-1 ' })).toEqual({ sessionId: 'session-1' })
    expect(() => validatePreserveSessionInput({ sessionId: 'session-1', uid: 'spoofed' })).toThrow()
    const expiresAt = anonymousSessionExpiration(now)
    expect(hasValidAnonymousRetentionMarker('session-1', 'ABC234', expiresAt, { sessionId: 'session-1', code: 'ABC234', expiresAt })).toBe(true)
    expect(hasValidAnonymousRetentionMarker('session-1', 'ABC234', expiresAt, { sessionId: 'other', code: 'ABC234', expiresAt })).toBe(false)
  })

  it('does not delete persistent sessions when a stale marker disappears', async () => {
    const sessionReference = { get: vi.fn(async () => ({ exists: true, data: () => ({ retentionKind: 'persistent' }) })) }
    const firestore = { collection: () => ({ doc: () => sessionReference }) }
    await expect(cleanupExpiredSessionRecord(firestore as never, 'session-1', undefined)).resolves.toBe('preserved')
  })

  it('restores an early TTL marker and recursively removes an expired anonymous session', async () => {
    const future = Timestamp.fromMillis(Date.now() + 60_000)
    const set = vi.fn(async () => undefined)
    const futureSession = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ retentionKind: 'anonymous', code: 'ABC234', expiresAt: future }) })),
    }
    const futureFirestore = {
      collection: (name: string) => ({ doc: () => name === 'sessions' ? futureSession : { set } }),
    }
    await expect(cleanupExpiredSessionRecord(futureFirestore as never, 'session-1', { sessionId: 'session-1', code: 'ABC234', expiresAt: future })).resolves.toBe('restored')
    expect(set).toHaveBeenCalledWith({ sessionId: 'session-1', code: 'ABC234', expiresAt: future })

    const expired = Timestamp.fromMillis(Date.now() - 60_000)
    const deletedPaths: unknown[] = []
    const playerDocs = [{ id: 'host' }, { id: 'guest' }]
    const expiredSession = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ retentionKind: 'anonymous', code: 'ABC234', expiresAt: expired }) })),
      collection: () => ({ get: vi.fn(async () => ({ docs: playerDocs })) }),
    }
    const document = (path: string) => ({ path, collection: (child: string) => ({ doc: (id: string) => ({ path: `${path}/${child}/${id}` }) }) })
    const batch = { delete: (reference: unknown) => deletedPaths.push(reference), commit: vi.fn(async () => undefined) }
    const expiredFirestore = {
      collection: (name: string) => ({ doc: (id: string) => name === 'sessions' ? expiredSession : document(`${name}/${id}`) }),
      recursiveDelete: vi.fn(async () => undefined),
      batch: () => batch,
    }
    await expect(cleanupExpiredSessionRecord(expiredFirestore as never, 'session-1', { sessionId: 'session-1', code: 'ABC234', expiresAt: expired })).resolves.toBe('deleted')
    expect(deletedPaths).toHaveLength(3)
    expect(batch.commit).toHaveBeenCalledOnce()
    expect(expiredFirestore.recursiveDelete).toHaveBeenCalledWith(expiredSession)
    expect(batch.commit.mock.invocationCallOrder[0]).toBeLessThan(expiredFirestore.recursiveDelete.mock.invocationCallOrder[0])
  })
})
