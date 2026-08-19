import { describe, expect, it } from 'vitest'

import type { ScoreEntry } from '../../application/sessions'
import { orderScoreEntries } from '../../infrastructure/firebase/scoreOrdering'

const entry = (sequence: number): ScoreEntry => ({ ownerUid: 'player', ownerDisplayName: 'Player', entryId: `entry-${sequence}`, points: 5, sequence })

describe('score read ordering', () => {
  it('sorts arbitrary Firestore order into the authoritative chronology', () => {
    expect(orderScoreEntries([entry(3), entry(1), entry(2)], 4).map((item) => item.sequence)).toEqual([1, 2, 3])
  })

  it('accepts an empty ledger only with its initial counter', () => {
    expect(orderScoreEntries([], 1)).toEqual([])
    expect(() => orderScoreEntries([], 2)).toThrow('Invalid score ordering.')
  })

  it.each([
    [[entry(1), entry(1)], 3],
    [[entry(1), entry(3)], 3],
    [[entry(1), entry(2)], 2],
    [[entry(1), entry(2)], 4],
  ])('fails closed for an ambiguous or mismatched ledger', (entries, nextScoreSequence) => {
    expect(() => orderScoreEntries(entries, nextScoreSequence)).toThrow('Invalid score ordering.')
  })
})
