import { firebaseAuthentication } from '../infrastructure/firebase/authentication'

import { useAuthentication } from './useAuthentication'

function App() {
  const authentication = useAuthentication(firebaseAuthentication)

  return (
    <main className="app">
      <h1>Cinque</h1>
      <p>Fundación inicial del proyecto lista.</p>
      <p>Autenticación: {authentication.status}</p>
      {authentication.status === 'error' && (
        <>
          <p>No se pudo inicializar la autenticación local.</p>
          <button type="button" onClick={() => firebaseAuthentication.retry()}>
            Reintentar autenticación
          </button>
        </>
      )}
    </main>
  )
}

export default App
