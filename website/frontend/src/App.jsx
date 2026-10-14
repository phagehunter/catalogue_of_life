import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { MetaProvider } from './components/MetaContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import SearchBox from './components/SearchBox.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import Citation from './components/Citation.jsx'
import { LeafMark } from './components/Icons.jsx'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import SearchResults from './pages/SearchResults.jsx'
import Taxon from './pages/Taxon.jsx'
import Compare from './pages/Compare.jsx'
import About from './pages/About.jsx'
import NotFound from './pages/NotFound.jsx'

export const REPO_URL = 'https://github.com/phagehunter/catalogue_of_life'

export default function App() {
  const location = useLocation()
  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" end>
            <LeafMark className="brand-mark" style={{ color: 'var(--accent)' }} />
            <span className="brand-text">Catalogue of Life Explorer</span>
            <span className="brand-tag" title="An independent explorer, not the official Catalogue of Life site">unofficial</span>
          </NavLink>
          <nav className="nav" aria-label="Primary">
            <NavLink to="/explore">Explore</NavLink>
            <NavLink to="/compare">Compare</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
          <div className="topbar-tools">
            <MetaProvider>
              {location.pathname !== '/' ? <div className="topbar-search"><SearchBox /></div> : null}
            </MetaProvider>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main">
        <ErrorBoundary resetKey={location.key}>
          <MetaProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/search" element={<SearchResults />} />
              <Route path="/taxon/:id" element={<Taxon />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/lca" element={<Compare />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </MetaProvider>
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <MetaProvider><Citation long /></MetaProvider>
          <div>
            Built by <a href="https://curtishoffmann.com/" target="_blank" rel="noreferrer">Curtis Hoffmann</a> as a static site with React and Vite. <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a> · Code MIT licensed.
          </div>
        </div>
      </footer>
    </div>
  )
}
