import type { ScoreEntry } from '../../application/sessions'

export function orderScoreEntries(entries: readonly ScoreEntry[], nextScoreSequence: unknown): ScoreEntry[] {
  if (typeof nextScoreSequence !== 'number' || !Number.isSafeInteger(nextScoreSequence) || nextScoreSequence !== entries.length + 1) {
    throw new Error('Invalid score ordering.')
  }
  const sequences = new Set<number>()
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 1 || sequences.has(entry.sequence)) {
      throw new Error('Invalid score ordering.')
    }
    sequences.add(entry.sequence)
  }
  const ordered = [...entries].sort((first, second) => first.sequence - second.sequence)
  if (!ordered.every((entry, index) => entry.sequence === index + 1)) throw new Error('Invalid score ordering.')
  return ordered
}
