import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import SearchPage from './pages/Search.jsx'
import Taxon from './pages/Taxon.jsx'
import About from './pages/About.jsx'
import LCA from './pages/LCA.jsx'
import GlobalSearchBar from './components/GlobalSearchBar.jsx'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand" end>
          <span className="brand-mark">🌿</span>
          <span className="brand-text">Catalogue of Life</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/lca">★ LCA</NavLink>
          <NavLink to="/explore">Browse</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <div className="topsearch">
          <GlobalSearchBar />
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lca" element={<LCA />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/taxon/:id" element={<Taxon />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="footer">
        <div>
          Data © <a href="https://www.catalogueoflife.org/" target="_blank" rel="noreferrer">Catalogue of Life</a> contributors,
          released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC&nbsp;BY&nbsp;4.0</a>.
        </div>
        <div className="footer-meta">
          Built statically with React + Vite. Source on GitHub.
        </div>
      </footer>
    </div>
  )
}

function NotFound() {
  return (
    <div className="page narrow">
      <h1>Lost in the tree of life</h1>
      <p>That page does not exist. Try the <NavLink to="/explore">Browse</NavLink> tab.</p>
    </div>
  )
}
