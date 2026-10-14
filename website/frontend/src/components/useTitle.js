import { useEffect } from 'react'

const SITE = 'Catalogue of Life Explorer'

export default function useTitle(title, description) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : SITE
    if (description) {
      let el = document.querySelector('meta[name="description"]')
      if (!el) { el = document.createElement('meta'); el.name = 'description'; document.head.appendChild(el) }
      el.content = description
    }
  }, [title, description])
}
