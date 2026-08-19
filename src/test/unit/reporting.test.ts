import { describe, expect, it } from 'vitest'

import { commandForReportAttempt, type PendingReportCommand } from '../../application/reporting'

const firstPayload = { scoreOwnerUid: 'owner', scoreEntryId: 'entry-1', reason: 'Incorrect', proposedPoints: 0 }

describe('commandForReportAttempt', () => {
  it('reuses a command only for the same normalized logical payload', () => {
    let next = 0
    const create = () => `command-${++next}`
    const first = commandForReportAttempt(undefined, firstPayload, create)
    expect(first.commandId).toBe('command-1')
    expect(commandForReportAttempt(first, { ...firstPayload, reason: 'Incorrect' }, create)).toBe(first)
    expect(commandForReportAttempt(first, { ...firstPayload, reason: 'Different' }, create).commandId).toBe('command-2')
    expect(commandForReportAttempt(first, { ...firstPayload, proposedPoints: 5 }, create).commandId).toBe('command-3')
    expect(commandForReportAttempt(first, { ...firstPayload, scoreEntryId: 'entry-2' }, create).commandId).toBe('command-4')
  })

  it('starts a fresh command after confirmed success clears pending state', () => {
    const pending: PendingReportCommand = { payload: firstPayload, commandId: 'command-1' }
    expect(commandForReportAttempt(undefined, firstPayload, () => 'command-2')).not.toBe(pending)
    expect(commandForReportAttempt(undefined, firstPayload, () => 'command-2').commandId).toBe('command-2')
  })
})
