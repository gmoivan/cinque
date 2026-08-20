import { describe, expect, it } from 'vitest'

import { validateResolveScoreReportInput } from '../src/resolveScoreReport.js'

const reportId = '123e4567-e89b-42d3-a456-426614174001'
const commandId = '123e4567-e89b-42d3-a456-426614174002'

describe('resolveScoreReport input', () => {
  it('requires a command, report, and corrected multiple of five for acceptance', () => {
    expect(validateResolveScoreReportInput({ sessionId: ' session-1 ', reportId, outcome: 'accepted', correctedScore: 0, reason: ' Ajustado ', commandId })).toEqual({ sessionId: 'session-1', reportId, outcome: 'accepted', correctedScore: 0, reason: 'Ajustado', commandId })
    expect(validateResolveScoreReportInput({ sessionId: 'session-1', reportId, outcome: 'rejected', commandId })).toMatchObject({ outcome: 'rejected' })
    for (const value of [undefined, -5, 7, 2.5]) expect(() => validateResolveScoreReportInput({ sessionId: 'session-1', reportId, outcome: 'accepted', correctedScore: value, commandId })).toThrow()
    expect(() => validateResolveScoreReportInput({ sessionId: 'session-1', reportId, outcome: 'rejected', correctedScore: 0, commandId })).toThrow()
  })
})
