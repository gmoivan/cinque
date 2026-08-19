// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
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
      await setDoc(doc(db, `${sessionPath}/players/host`), { displayName: 'Host', totalScore: 0 })
      await setDoc(doc(db, `${sessionPath}/players/host/scoreEntries/command-1`), { points: 5, playerUid: 'host' })
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
    await assertSucceeds(getDoc(doc(host, `${sessionPath}/players/host/scoreEntries/command-1`)))
    await assertFails(getDoc(doc(stranger, sessionPath)))
    await assertFails(getDoc(doc(stranger, `${sessionPath}/players/host`)))
    await assertFails(getDoc(doc(stranger, `${sessionPath}/players/host/scoreEntries/command-1`)))
    await assertFails(getDoc(doc(anonymous, sessionPath)))
  })

  it('denies direct session, membership, and session-code writes and code reads', async () => {
    await seedSession()
    const db = testEnvironment.authenticatedContext('host').firestore()
    const member = testEnvironment.authenticatedContext('member').firestore()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `${sessionPath}/players/member`), { displayName: 'Member' })
    })
    await assertFails(setDoc(doc(db, 'sessions', 'new-session'), { status: 'lobby' }))
    await assertFails(updateDoc(doc(db, sessionPath), { targetScore: 300 }))
    await assertFails(setDoc(doc(db, `${sessionPath}/players/host`), { displayName: 'Changed' }))
    await assertFails(setDoc(doc(db, `${sessionPath}/players/other-user`), { displayName: 'Other user' }))
    await assertFails(setDoc(doc(db, 'sessionCodes', 'ABCDEF'), { sessionId: 'new-session' }))
    await assertFails(getDoc(doc(db, 'sessionCodes', 'ABCDEF')))
    await assertFails(updateDoc(doc(db, sessionPath), { status: 'active' }))
    await assertFails(updateDoc(doc(db, sessionPath), { status: 'finished' }))
    await assertFails(updateDoc(doc(member, sessionPath), { status: 'active' }))
    await assertFails(updateDoc(doc(db, sessionPath), { startedAt: new Date() }))
    await assertFails(updateDoc(doc(db, sessionPath), { winnerUid: 'host' }))
    await assertFails(updateDoc(doc(db, sessionPath), { winningTotalScore: 200 }))
    await assertFails(updateDoc(doc(db, `${sessionPath}/players/host`), { totalScore: 999 }))
    await assertFails(updateDoc(doc(member, `${sessionPath}/players/host`), { totalScore: 999 }))
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), sessionPath), { status: 'active', startedAt: new Date(), winnerUid: 'host', winnerDetectedAt: new Date(), winningScoreCommandId: 'command-1', winningTotalScore: 200 })
    })
    await assertSucceeds(getDoc(doc(member, sessionPath)))
    await assertFails(updateDoc(doc(member, sessionPath), { winnerUid: 'member', winningTotalScore: 205 }))
    await assertFails(updateDoc(doc(member, sessionPath), { winnerUid: null, winnerDetectedAt: null, winningScoreCommandId: null, winningTotalScore: null }))
    await assertFails(updateDoc(doc(db, sessionPath), { status: 'finished', winnerUid: 'host', winnerDetectedAt: new Date(), winningScoreCommandId: 'command-1', winningTotalScore: 200 }))
  })

  it('denies member creation, update, and deletion of immutable score entries', async () => {
    await seedSession()
    const host = testEnvironment.authenticatedContext('host').firestore()
    const existingEntry = doc(host, `${sessionPath}/players/host/scoreEntries/command-1`)

    await assertFails(setDoc(doc(host, `${sessionPath}/players/host/scoreEntries/command-2`), { points: 10, playerUid: 'host' }))
    await assertFails(updateDoc(existingEntry, { points: 10 }))
    await assertFails(deleteDoc(existingEntry))
  })
})
