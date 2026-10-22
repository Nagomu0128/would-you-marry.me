import { AnimatePresence, m } from 'motion/react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DURATION, TOAST_DURATION_MS } from './constants'

type ToastItem = { id: number; message: string }

export type ToastContextValue = {
  /** トーストを出す。前のトーストは置き換える */
  show: (message: string) => void
  /** 今のトーストを消す */
  dismiss: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export type ToastProviderProps = {
  children: ReactNode
  /** 表示する時間（ミリ秒）。既定は 3 秒 */
  duration?: number
  /** 下部ナビゲーションがある画面では 'nav'（ナビの上に出す）、ない画面では 'none' */
  bottom?: 'nav' | 'none'
}

/** 画面下部（ナビゲーションの上）に、金の縁の短冊のトーストを 3 秒表示する。アプリのルート付近に 1 つ置く。 */
export function ToastProvider({
  children,
  duration = TOAST_DURATION_MS,
  bottom = 'nav',
}: ToastProviderProps) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const nextId = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setToast(null)
  }, [clearTimer])

  const show = useCallback(
    (message: string) => {
      clearTimer()
      nextId.current += 1
      setToast({ id: nextId.current, message })
      timer.current = setTimeout(() => {
        timer.current = null
        setToast(null)
      }, duration)
    },
    [clearTimer, duration],
  )

  useEffect(() => clearTimer, [clearTimer])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" data-bottom={bottom}>
        {/* 読み上げ用の領域は常に残し、中身だけを入れ替える */}
        <div role="status" aria-live="polite" className="contents">
          <AnimatePresence>
            {toast ? (
              <m.p
                key={toast.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: DURATION.normal, ease: 'easeOut' }}
                className="toast"
              >
                {toast.message}
              </m.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  )
}

/** `ToastProvider` の中で使う */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast は ToastProvider の中で使ってください')
  return context
}
