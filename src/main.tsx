import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startCloud } from './state/cloud'
import './styles.css'

startCloud()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
