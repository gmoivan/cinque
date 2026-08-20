import { describe, expect, it } from 'vitest'

import { createJoinLink, joinCodeFromUrl, normalizeJoinCode } from '../../application/joinLinks'

describe('join links', () => {
  it('normalizes a valid short code and rejects ambiguous or malformed values', () => {
    expect(normalizeJoinCode(' ab2cd3 ')).toBe('AB2CD3')
    expect(normalizeJoinCode('ABC12O')).toBeUndefined()
    expect(normalizeJoinCode('ABC12')).toBeUndefined()
  })

  it('parses and creates a shareable URL without exposing a session ID', () => {
    expect(joinCodeFromUrl('https://cinque.example/?join=ab2cd3')).toBe('AB2CD3')
    expect(joinCodeFromUrl('not a url')).toBeUndefined()
    const link = createJoinLink('https://cinque.example/play?source=home#private', 'AB2CD3')
    expect(link).toBe('https://cinque.example/play?source=home&join=AB2CD3')
    expect(link).not.toContain('sessionId')
  })
})
