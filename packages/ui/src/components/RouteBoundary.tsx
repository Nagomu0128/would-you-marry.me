import { Component, type ReactNode } from 'react'
import { Button } from './Button'

/** A failed route download must leave a usable recovery action on unreliable venue Wi-Fi. */
export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="empty-state" role="alert">
        <p>画面を読み込めませんでした。電波の良い場所でもう一度お試しください。</p>
        <Button onClick={() => window.location.reload()}>画面を読み込み直す</Button>
      </div>
    )
  }
}
