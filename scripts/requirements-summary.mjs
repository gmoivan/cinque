import { readFile } from 'node:fs/promises'

const path = new URL('../docs/requirements/mvp-requirements.md', import.meta.url)
const text = await readFile(path, 'utf8')
const requirements = text.split(/(?=^\* \*\*REQ-[A-Z]+-\d+\*\*)/m).filter((block) => block.startsWith('* **REQ-'))

if (requirements.length !== 94) throw new Error(`Expected 94 requirements, found ${requirements.length}.`)

const count = (pattern) => requirements.filter((block) => pattern.test(block)).length
const summary = {
  total: requirements.length,
  implemented: count(/\*Status:\* Implemented/),
  partial: count(/\*Status:\* Partial/),
  missing: count(/\*Status:\* Missing/),
  deferred: count(/\*Status:\* Deferred/),
  decisionRequired: count(/\*Status:\* Decision Required/),
  direct: count(/\*Coverage:\* Direct/),
  indirect: count(/\*Coverage:\* Indirect/),
  none: count(/\*Coverage:\* None/),
}

const expected = { total: 94, implemented: 89, partial: 0, missing: 0, deferred: 5, decisionRequired: 0, direct: 84, indirect: 2, none: 8 }
for (const [key, value] of Object.entries(expected)) {
  if (summary[key] !== value) throw new Error(`Expected ${key}=${value}, found ${summary[key]}.`)
}

console.log(JSON.stringify(summary, null, 2))
