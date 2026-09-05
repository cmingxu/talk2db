import { useEffect, useState } from 'react'

// Tiny client-side router (no react-router needed for the demo).
// Navigating to /about or /contact then refreshing proves the C++ server's
// SPA fallback serves index.html for deep links.
const ROUTES = {
  '/': () => <Home />,
  '/about': () => <p>About — served by the SPA fallback from the C++ binary.</p>,
  '/contact': () => <p>Contact — also a client-side route.</p>,
}

function Home() {
  const [health, setHealth] = useState('loading...')
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHealth(JSON.stringify(d)))
      .catch(e => setHealth('error: ' + e.message))
  }, [])
  return (
    <>
      <h1>Hello from a Vite SPA embedded in a C++ binary</h1>
      <p>
        This page, the JS bundle and the styles are compiled into the{' '}
        <code>server</code> executable. No static files on disk.
      </p>
      <p>
        Backend check: <code>{health}</code>
      </p>
    </>
  )
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const nav = (to) => {
    window.history.pushState({}, '', to)
    setPath(to)
  }

  const Page = ROUTES[path] || (() => <p>404 — client-side fallback</p>)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '40px auto', lineHeight: 1.6 }}>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <a href="#" onClick={e => { e.preventDefault(); nav('/') }}>Home</a>
        <a href="#" onClick={e => { e.preventDefault(); nav('/about') }}>About</a>
        <a href="#" onClick={e => { e.preventDefault(); nav('/contact') }}>Contact</a>
      </nav>
      {Page()}
    </div>
  )
}
