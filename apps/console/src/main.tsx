import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { ConsoleRuntimeBoundary } from './ConsoleRuntimeBoundary'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Mainspring console root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <ConsoleRuntimeBoundary>
      <App />
    </ConsoleRuntimeBoundary>
  </StrictMode>,
)
