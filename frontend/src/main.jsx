import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { configureServiceWorker } from './lib/serviceWorkerRegistration.js'

configureServiceWorker({ isProduction: import.meta.env.PROD })
  .catch((error) => console.error('Service worker configuration failed', error))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
