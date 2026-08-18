import { firebaseAuthentication } from '../infrastructure/firebase/authentication'

import { useAuthentication } from './useAuthentication'

function App() {
  const authentication = useAuthentication(firebaseAuthentication)
  const googleOutcome = firebaseAuthentication.getGoogleAuthenticationOutcome()

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
    </main>
  )
}

export default App
