import { describe, expect, it } from 'vitest'

import { validateReopenGameInput } from '../src/reopenGame.js'

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
})
