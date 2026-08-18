import { describe, expect, it } from 'vitest'

import {
  allocateUniqueSessionCode,
  generateSessionCode,
  maxCodeAllocationAttempts,
  sessionCodeAlphabet,
  validateCreateSessionInput,
} from '../src/createSession.js'

describe('createSession validation', () => {
  it('trims valid display names and accepts target boundaries', () => {
    expect(validateCreateSessionInput({ displayName: '  Ana  ', targetScore: 200 })).toEqual({ displayName: 'Ana', targetScore: 200 })
    expect(validateCreateSessionInput({ displayName: 'Ana', targetScore: 1000 }).targetScore).toBe(1000)
  })

  it.each(['', ' '.repeat(25), 'bad\u0000name'])('rejects invalid display names', (displayName) => {
    expect(() => validateCreateSessionInput({ displayName, targetScore: 200 })).toThrow()
  })

  it.each([199, 1005, 302.5, 201])('rejects invalid targets', (targetScore) => {
    expect(() => validateCreateSessionInput({ displayName: 'Ana', targetScore })).toThrow()
  })
})

describe('session code allocation', () => {
  it('uses the unambiguous six-character alphabet', () => {
    const code = generateSessionCode(() => 0)
    expect(code).toHaveLength(6)
    expect([...code].every((character) => sessionCodeAlphabet.includes(character))).toBe(true)
  })

  it('retries a collision', async () => {
    const codes = ['AAAAAA', 'BBBBBB']
    await expect(allocateUniqueSessionCode(async (code) => code === 'AAAAAA', () => codes.shift() ?? 'CCCCCC')).resolves.toBe('BBBBBB')
  })

  it('fails after bounded collisions', async () => {
    await expect(allocateUniqueSessionCode(async () => true, () => 'AAAAAA')).rejects.toMatchObject({ code: 'internal' })
    expect(maxCodeAllocationAttempts).toBeGreaterThan(0)
  })
})
