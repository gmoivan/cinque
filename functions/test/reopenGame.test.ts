import { Timestamp } from 'firebase-admin/firestore'
import { describe, expect, it, vi } from 'vitest'

import { reopenGameRecord, validateReopenGameInput } from '../src/reopenGame.js'

const commandId = '123e4567-e89b-42d3-a456-426614174500'

describe('reopenGame input', () => {
  it('normalizes a mandatory bounded reason and validates exact input', () => {
    expect(validateReopenGameInput({ sessionId: ' session-1 ', reason: ' Marcador incorrecto ', commandId }))
      .toEqual({ sessionId: 'session-1', reason: 'Marcador incorrecto', commandId })
    for (const reason of ['', '   ', 'x'.repeat(281), 'motivo\u0000']) {
      expect(() => validateReopenGameInput({ sessionId: 'session-1', reason, commandId })).toThrow()
    }
    expect(() => validateReopenGameInput({ sessionId: 'session-1', reason: 'válido', commandId, winnerUid: 'host' })).toThrow()
    expect(() => validateReopenGameInput({ sessionId: 'session-1', reason: 'válido', commandId: 'retry' })).toThrow()
  })

  it('fails closed without writes when finalized winner state is incomplete', async () => {
    const transaction = {
      get: vi.fn()
        .mockResolvedValueOnce({ exists: true, data: () => ({
          status: 'finished', hostUid: 'host', targetScore: 200, openScoreReportCount: 0,
          winnerUid: 'host', winnerDetectedAt: Timestamp.now(), winningScoreCommandId: commandId,
          finalizationCommandId: '123e4567-e89b-42d3-a456-426614174501', finishedAt: Timestamp.now(),
          // winningTotalScore is intentionally absent.
        }) })
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ size: 0 }),
      create: vi.fn(),
      update: vi.fn(),
    }
    const document = { collection: () => ({ doc: () => ({}), where: () => ({}) }) }
    const firestore = {
      collection: () => ({ doc: () => document }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    }

    await expect(reopenGameRecord(firestore as never, 'host', {
      sessionId: 'session-1', reason: 'Corregir marcador', commandId,
    })).rejects.toMatchObject({ code: 'unavailable' })
    expect(transaction.create).not.toHaveBeenCalled()
    expect(transaction.update).not.toHaveBeenCalled()
  })
})
