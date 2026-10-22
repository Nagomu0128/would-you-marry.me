import { Component, type ReactNode } from 'react'
import { ja } from '../messages/ja'
import { MizuhikiKnot } from '../ornaments/MizuhikiKnot'
import { Button } from './Button'

/** 画面（ルート）の取得に失敗しても、会場の不安定な回線で読み込み直せる操作を残す */
export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="error-state" role="alert">
        <MizuhikiKnot strands="one" tone="kin" className="error-state-knot" />
        <p className="error-state-message">{ja.common.routeError.message}</p>
        <Button onClick={() => window.location.reload()}>{ja.common.routeError.reload}</Button>
      </div>
    )
  }
}
