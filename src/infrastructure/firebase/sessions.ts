import { httpsCallable, type Functions } from 'firebase/functions'
import { doc, getDoc } from 'firebase/firestore'

import {
  CreateSessionError,
  type CreateSessionInput,
  type CreatedSession,
  type CurrentSession,
  JoinSessionError,
  type JoinSessionInput,
  type JoinedSession,
  StartSessionError,
  type StartSessionInput,
  type StartedSession,
  type SessionService,
} from '../../application/sessions'

import { firebaseFirestore, firebaseFunctions } from './config'

type CallableCreateSessionResult = CreatedSession
type CallableJoinSessionResult = JoinedSession
type CallableStartSessionResult = StartedSession

function toCreateSessionError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  if (code === 'functions/unauthenticated') return new CreateSessionError('authentication-required')
  if (code === 'functions/invalid-argument') return new CreateSessionError('invalid-input')
  return new CreateSessionError('unavailable')
}

function toJoinSessionError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new JoinSessionError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new JoinSessionError('invalid-code')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details
    ? (callableError.details as { reason?: unknown }).reason
    : undefined
  if (reason === 'session-not-found' || reason === 'session-full' || reason === 'display-name-taken' || reason === 'session-not-joinable') {
    return new JoinSessionError(reason)
  }
  return new JoinSessionError('unavailable')
}

function toStartSessionError(error: unknown) {
  const callableError = typeof error === 'object' && error !== null ? error as { code?: unknown, details?: unknown } : undefined
  if (callableError?.code === 'functions/unauthenticated') return new StartSessionError('authentication-required')
  if (callableError?.code === 'functions/invalid-argument') return new StartSessionError('invalid-input')
  if (callableError?.code === 'functions/permission-denied') return new StartSessionError('not-host')
  const reason = callableError?.details && typeof callableError.details === 'object' && 'reason' in callableError.details
    ? (callableError.details as { reason?: unknown }).reason
    : undefined
  if (reason === 'session-not-found' || reason === 'not-enough-players' || reason === 'session-not-startable') {
    return new StartSessionError(reason)
  }
  return new StartSessionError('unavailable')
}

export class FirebaseSessionService implements SessionService {
  private readonly functions: Functions

  constructor(functions: Functions = firebaseFunctions) {
    this.functions = functions
  }

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    try {
      const callable = httpsCallable<CreateSessionInput, CallableCreateSessionResult>(this.functions, 'createSession')
      return (await callable(input)).data
    } catch (error) {
      throw toCreateSessionError(error)
    }
  }

  async joinSession(input: JoinSessionInput): Promise<JoinedSession> {
    try {
      const callable = httpsCallable<JoinSessionInput, CallableJoinSessionResult>(this.functions, 'joinSession')
      return (await callable(input)).data
    } catch (error) {
      throw toJoinSessionError(error)
    }
  }

  async startSession(input: StartSessionInput): Promise<StartedSession> {
    try {
      const callable = httpsCallable<StartSessionInput, CallableStartSessionResult>(this.functions, 'startSession')
      return (await callable(input)).data
    } catch (error) {
      throw toStartSessionError(error)
    }
  }

  async getSession(sessionId: string): Promise<CurrentSession> {
    try {
      const snapshot = await getDoc(doc(firebaseFirestore, 'sessions', sessionId))
      const data = snapshot.data()
      if (!snapshot.exists() || !data || typeof data.hostUid !== 'string' || typeof data.status !== 'string' || !Number.isInteger(data.playerCount)) {
        throw new Error('Invalid session state.')
      }
      return { sessionId, hostUid: data.hostUid, status: data.status, playerCount: data.playerCount }
    } catch {
      throw new StartSessionError('unavailable')
    }
  }
}

export const firebaseSessionCreation = new FirebaseSessionService()
