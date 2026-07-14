import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'jotai'
import './index.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import PublishedRenderer from './components/PublishedRenderer.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/view/:pageId" element={<PublishedRenderer />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
