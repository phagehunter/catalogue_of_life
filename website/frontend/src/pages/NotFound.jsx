import { Link } from 'react-router-dom'
import useTitle from '../components/useTitle.js'

export default function NotFound() {
  useTitle('Page not found')
  return (
    <div className="page narrow">
      <h1>Lost in the tree of life</h1>
      <p>That page does not exist. Try <Link to="/explore">exploring from the top</Link> or searching for a name.</p>
    </div>
  )
}
