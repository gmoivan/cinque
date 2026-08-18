import { httpsCallable, type Functions } from 'firebase/functions'

import {
  CreateSessionError,
  type CreateSessionInput,
  type CreatedSession,
  type SessionCreationService,
} from '../../application/sessions'

import { firebaseFunctions } from './config'

type CallableCreateSessionResult = CreatedSession

function toApplicationError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  if (code === 'functions/unauthenticated') return new CreateSessionError('authentication-required')
  if (code === 'functions/invalid-argument') return new CreateSessionError('invalid-input')
  return new CreateSessionError('unavailable')
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
      throw toApplicationError(error)
    }
  }
}

export const firebaseSessionCreation = new FirebaseSessionCreationService()
