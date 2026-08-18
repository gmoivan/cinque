import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './app/App'
import { initializeFirebase } from './infrastructure/firebase/bootstrap'
import './styles/global.css'

initializeFirebase()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
