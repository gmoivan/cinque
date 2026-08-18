import { describe, expect, it } from 'vitest'

import { normalizeDisplayName, validateDisplayName, validateSessionCode } from '../src/sessionValidation.js'
import { validateJoinSessionInput } from '../src/joinSession.js'

describe('joinSession validation', () => {
  it('strictly accepts only a normalized code and valid trimmed display name', () => {
    expect(validateJoinSessionInput({ code: ' ab2cd3 ', displayName: '  Ana  ' })).toEqual({
      code: 'AB2CD3', displayName: 'Ana', displayNameKey: 'ana',
    })
  })

  it.each(['ABC12', 'ABC12O', 'ABC12I', 'ABC12-', 123])('rejects malformed session codes', (code) => {
    expect(() => validateSessionCode(code)).toThrow()
  })

  it.each(['', ' '.repeat(25), 'bad\u0000name', undefined])('uses the same display-name validation as Create Session', (name) => {
    expect(() => validateDisplayName(name)).toThrow()
  })

  it('treats Unicode normalization and case variants as the same name', () => {
    expect(normalizeDisplayName('IVAN')).toBe(normalizeDisplayName('ivan'))
    expect(normalizeDisplayName('I\u0301van')).toBe(normalizeDisplayName('ÍVAN'))
  })

  it('rejects unexpected client-controlled properties', () => {
    expect(() => validateJoinSessionInput({ code: 'ABC234', displayName: 'Ana', uid: 'spoofed' })).toThrow()
  })
})
