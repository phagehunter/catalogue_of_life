import { createContext, useContext, useEffect, useState } from 'react'
import { getMeta } from '../data/api.js'
import Skeleton from './Skeleton.jsx'

const MetaContext = createContext(null)

export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    getMeta().then(setMeta).catch(e => setError(e))
  }, [])
  if (error) {
    return (
      <main>
        <div className="notice error" role="alert">
          <strong>The dataset could not be loaded.</strong> {error.message}
          <div className="small muted" style={{ marginTop: '.5rem' }}>
            The data build has probably not run yet. See the README for how the GitHub Action publishes <code>data/</code>.
          </div>
        </div>
      </main>
    )
  }
  if (!meta) return <main><Skeleton lines={6} /></main>
  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>
}

export function useMeta() {
  return useContext(MetaContext)
}
