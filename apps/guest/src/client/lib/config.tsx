import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { getConfig } from './api'

const ContactEmailContext = createContext<string | null>(null)

/** `GET /api/config` を 1 回だけ取得して共有する（フッターと問い合わせボタン用） */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [contactEmail, setContactEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getConfig()
      .then((config) => {
        if (!cancelled) setContactEmail(config.contactEmail)
      })
      .catch(() => {
        // 取得できなくても画面は使える。問い合わせ先だけ出さない
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ContactEmailContext.Provider value={contactEmail}>{children}</ContactEmailContext.Provider>
  )
}

/** 問い合わせ先。取得前・取得失敗のときは null */
export function useContactEmail(): string | null {
  return useContext(ContactEmailContext)
}
