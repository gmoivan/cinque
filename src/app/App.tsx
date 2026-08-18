import { firebaseAuthentication } from '../infrastructure/firebase/authentication'
import { firebaseSessionCreation } from '../infrastructure/firebase/sessions'
import { CreateSessionError, type CreatedSession } from '../application/sessions'

import { useAuthentication } from './useAuthentication'
import { useState } from 'react'

function App() {
  const authentication = useAuthentication(firebaseAuthentication)
  const googleOutcome = firebaseAuthentication.getGoogleAuthenticationOutcome()
  const [displayName, setDisplayName] = useState('')
  const [targetScore, setTargetScore] = useState(200)
  const [creating, setCreating] = useState(false)
  const [createdSession, setCreatedSession] = useState<CreatedSession | undefined>()
  const [createError, setCreateError] = useState<string | undefined>()

  async function createSession() {
    if (creating || authentication.status === 'error') return
    setCreating(true)
    setCreateError(undefined)
    setCreatedSession(undefined)
    try {
      if (authentication.status === 'signedOut') await firebaseAuthentication.ensureAnonymousIdentity()
      const result = await firebaseSessionCreation.createSession({ displayName, targetScore })
      setCreatedSession(result)
    } catch (error) {
      setCreateError(error instanceof CreateSessionError && error.code === 'invalid-input'
        ? 'Check the player name and target score.'
        : 'Session creation is unavailable. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="app">
      <h1>Cinque</h1>
      <p>Fundación inicial del proyecto lista.</p>
      <p>Autenticación: {authentication.status}</p>
      {authentication.status === 'signedOut' && (
        <button type="button" onClick={() => void firebaseAuthentication.continueWithGoogle()}>
          Continue with Google
        </button>
      )}
      {authentication.status === 'authenticated' && authentication.identity.kind === 'anonymous' && (
        <button type="button" onClick={() => void firebaseAuthentication.continueWithGoogle()}>
          Link Google account
        </button>
      )}
      {googleOutcome.status === 'credential-already-in-use' && (
        <p>This Google account is already linked elsewhere. You can continue anonymously.</p>
      )}
      {googleOutcome.status === 'cancelled' && <p>Google authentication was cancelled.</p>}
      {googleOutcome.status === 'failed' && <p>Google authentication could not be completed.</p>}
      {authentication.status === 'error' && (
        <>
          <p>
            {authentication.code === 'identity-invariant-violation'
              ? 'Authentication could not be safely completed.'
              : 'No se pudo inicializar la autenticación local.'}
          </p>
          <button type="button" onClick={() => firebaseAuthentication.retry()}>
            Reintentar autenticación
          </button>
        </>
      )}
      <section aria-label="Create session">
        <h2>Create session</h2>
        <label>
          Player name
          <input value={displayName} maxLength={24} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <fieldset>
          <legend>Target score</legend>
          {[200, 300, 500].map((target) => (
            <button type="button" key={target} onClick={() => setTargetScore(target)}>{target}</button>
          ))}
          <label>
            Custom target
            <input type="number" min="200" max="1000" step="5" value={targetScore} onChange={(event) => setTargetScore(Number(event.target.value))} />
          </label>
        </fieldset>
        <button type="button" disabled={creating || authentication.status === 'initializing' || authentication.status === 'error'} onClick={() => void createSession()}>
          {creating ? 'Creating session…' : 'Create session'}
        </button>
        {createError && <p role="alert">{createError}</p>}
        {createdSession && <p>Session created: code {createdSession.code}, ID {createdSession.sessionId}, target {createdSession.targetScore}.</p>}
      </section>
    </main>
  )
}

export default App
