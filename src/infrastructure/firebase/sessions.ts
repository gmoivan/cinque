import { httpsCallable, type Functions } from 'firebase/functions'

import {
  CreateSessionError,
  type CreateSessionInput,
  type CreatedSession,
  JoinSessionError,
  type JoinSessionInput,
  type JoinedSession,
  type SessionCreationService,
} from '../../application/sessions'

import { firebaseFunctions } from './config'

type CallableCreateSessionResult = CreatedSession
type CallableJoinSessionResult = JoinedSession

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

export class FirebaseSessionCreationService implements SessionCreationService {
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
}

export const firebaseSessionCreation = new FirebaseSessionCreationService()
