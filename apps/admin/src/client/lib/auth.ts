import { createAuthClient } from 'better-auth/react'

// 同一オリジンの /api/auth を使う（admin Worker の Better Auth）
export const authClient = createAuthClient()

/** Google でログインする。許可されないアカウントは `/login?error=denied` に戻る */
export function signInWithGoogle() {
  return authClient.signIn.social({
    provider: 'google',
    callbackURL: '/',
    errorCallbackURL: '/login?error=denied',
  })
}

export function signOut() {
  return authClient.signOut()
}
