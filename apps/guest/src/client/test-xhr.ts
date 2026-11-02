// テスト用の XMLHttpRequest のモック。送信の進捗・成功・失敗を、テストから好きなタイミングで起こす
import { vi } from 'vitest'

export class FakeXhr {
  static instances: FakeXhr[] = []

  method = ''
  url = ''
  status = 0
  response: unknown = ''
  responseType = ''
  withCredentials = false
  body: unknown
  aborted = false
  headers: Record<string, string> = {}
  upload: {
    onprogress: ((event: ProgressEvent) => void) | null
    onload: (() => void) | null
  } = { onprogress: null, onload: null }
  onprogress: (() => void) | null = null
  onreadystatechange: (() => void) | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() {
    FakeXhr.instances.push(this)
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {
    this.aborted = true
    this.onabort?.()
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent)
  }
  /** 送り終えた（サーバーの処理を待つ間に入る） */
  uploaded() {
    this.upload.onload?.()
  }
  respond(status: number, body: unknown) {
    this.status = status
    this.response = JSON.stringify(body)
    this.onload?.()
  }
  fail() {
    this.onerror?.()
  }
}

export function installFakeXhr() {
  FakeXhr.instances = []
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  return FakeXhr
}

export const lastXhr = () => FakeXhr.instances[FakeXhr.instances.length - 1]
