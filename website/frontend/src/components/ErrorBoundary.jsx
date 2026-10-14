import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="notice error" role="alert">
          <strong>Something went wrong on this page.</strong>
          <div className="small" style={{ marginTop: '.4rem' }}>{String(this.state.error.message || this.state.error)}</div>
          <div style={{ marginTop: '.6rem' }}>
            <button className="btn sm" type="button" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
