import { useReducedMotion } from 'motion/react'
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** 'register' は初回の登録（約 2.4 秒）、'change' はニックネームの変更（短い版、約 1.6 秒） */
export type OrizuruVariant = 'register' | 'change'
export type OrizuruOutcome = 'pending' | 'success' | 'failure'
export type OrizuruRun = { id: number; outcome: OrizuruOutcome; variant: OrizuruVariant }

export type OrizuruSequence = {
  /** 演出中。芳名帳の紙を隠し、入力欄を退かせる */
  active: boolean
  /** 送信した直後に呼ぶ。通信を待たずに紙を折り始める（動きを減らす設定では何もしない） */
  begin: () => void
  /** 通信が成功したら呼ぶ。鶴が画面の外へ出たら解決する */
  depart: () => Promise<void>
  /** 通信が失敗したら呼ぶ。鶴が降りてきて紙に戻ったら解決する */
  restore: () => Promise<void>
  /** 芳名帳の紙の要素。折り始める位置を測る（GuestbookSheet が使う） */
  sheetRef: RefObject<HTMLDivElement | null>
  /** 演出の状態（GuestbookSheet が使う） */
  run: OrizuruRun | null
  /** 演出が終わったことを知らせる（OrizuruStage が使う） */
  settle: (result: 'departed' | 'restored') => void
}

/** 演出が止まっても（タブが裏に回ったなど）、画面の移動やエラーの表示を待たせすぎない */
const FALLBACK_MS = 9000

/**
 * 記帳した紙が折り鶴になって飛び立つ演出の進行。
 * 通信と並行して折り、成功したら鶴が飛び去ってから、失敗したら紙に戻ってから続きを行う。
 *
 * ```ts
 * orizuru.begin()
 * try {
 *   await putNickname(...)
 *   await orizuru.depart()
 *   navigate(home)
 * } catch {
 *   await orizuru.restore()
 *   showError()
 * }
 * ```
 */
export function useOrizuruSequence(variant: OrizuruVariant): OrizuruSequence {
  const reduced = useReducedMotion() ?? false
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [run, setRun] = useState<OrizuruRun | null>(null)
  const active = useRef(false)
  const waiters = useRef<{ departed?: () => void; restored?: () => void }>({})
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const counter = useRef(0)

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
    },
    [],
  )

  const finish = useCallback((result: 'departed' | 'restored') => {
    if (result === 'departed') {
      // 鶴は画面の外。画面が移るまで紙は隠したままにする
      const resolve = waiters.current.departed
      waiters.current.departed = undefined
      resolve?.()
      return
    }
    active.current = false
    setRun(null)
    const resolve = waiters.current.restored
    waiters.current.restored = undefined
    resolve?.()
  }, [])

  const begin = useCallback(() => {
    if (reduced || active.current) return
    active.current = true
    counter.current += 1
    setRun({ id: counter.current, outcome: 'pending', variant })
  }, [reduced, variant])

  const wait = useCallback(
    (outcome: 'success' | 'failure') => {
      if (!active.current) return Promise.resolve()
      const result = outcome === 'success' ? 'departed' : 'restored'
      return new Promise<void>((resolve) => {
        waiters.current[result] = resolve
        setRun((current) => (current ? { ...current, outcome } : current))
        timers.current.push(
          setTimeout(() => {
            if (waiters.current[result] === resolve) finish(result)
          }, FALLBACK_MS),
        )
        // タブが裏にあると鶴は飛べない。待たずに進める
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          finish(result)
        }
      })
    },
    [finish],
  )

  const depart = useCallback(() => wait('success'), [wait])
  const restore = useCallback(() => wait('failure'), [wait])

  return useMemo(
    () => ({ active: run !== null, begin, depart, restore, sheetRef, run, settle: finish }),
    [run, begin, depart, restore, finish],
  )
}
