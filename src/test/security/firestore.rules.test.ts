// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, it } from 'vitest'

let testEnvironment: RulesTestEnvironment

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: 'demo-cinque',
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

describe('firestore.rules', () => {
  it('denies unauthenticated protected reads', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore()

    await assertFails(getDoc(doc(db, 'protected', 'doc-1')))
  })

  it('denies unauthenticated protected writes', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore()

    await assertFails(setDoc(doc(db, 'protected', 'doc-2'), { value: 1 }))
  })

  it('denies arbitrary protected writes for authenticated users', async () => {
    const db = testEnvironment.authenticatedContext('user-1').firestore()

    await assertFails(setDoc(doc(db, 'protected', 'doc-3'), { value: 1 }))
  })
})
