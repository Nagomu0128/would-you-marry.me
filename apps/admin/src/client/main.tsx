import { MotionProvider, ToastProvider } from '@wym/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root element not found')

createRoot(root).render(
  <StrictMode>
    <MotionProvider>
      <ToastProvider bottom="none">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </MotionProvider>
  </StrictMode>,
)
