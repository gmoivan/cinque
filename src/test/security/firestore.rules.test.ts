// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
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
  const sessionPath = 'sessions/session-1'

  async function seedSession() {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, sessionPath), { hostUid: 'host', status: 'lobby' })
      await setDoc(doc(db, `${sessionPath}/players/host`), { displayName: 'Host' })
    })
  }

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

  it('allows only members to read their session and players', async () => {
    await seedSession()
    const host = testEnvironment.authenticatedContext('host').firestore()
    const stranger = testEnvironment.authenticatedContext('stranger').firestore()
    const anonymous = testEnvironment.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(host, sessionPath)))
    await assertSucceeds(getDoc(doc(host, `${sessionPath}/players/host`)))
    await assertFails(getDoc(doc(stranger, sessionPath)))
    await assertFails(getDoc(doc(stranger, `${sessionPath}/players/host`)))
    await assertFails(getDoc(doc(anonymous, sessionPath)))
  })

  it('denies direct session, membership, and session-code writes and code reads', async () => {
    const db = testEnvironment.authenticatedContext('host').firestore()
    await assertFails(setDoc(doc(db, 'sessions', 'new-session'), { status: 'lobby' }))
    await assertFails(updateDoc(doc(db, sessionPath), { targetScore: 300 }))
    await assertFails(setDoc(doc(db, `${sessionPath}/players/host`), { displayName: 'Changed' }))
    await assertFails(setDoc(doc(db, `${sessionPath}/players/other-user`), { displayName: 'Other user' }))
    await assertFails(setDoc(doc(db, 'sessionCodes', 'ABCDEF'), { sessionId: 'new-session' }))
    await assertFails(getDoc(doc(db, 'sessionCodes', 'ABCDEF')))
  })
})
