// 写真の投稿キー（D-41）。`POST /photos` の再送で、同じ写真を二重に保存しないために使う

/**
 * 投稿キーを載せるリクエストヘッダー。
 * ブラウザは写真ごとに 1 つ作り、その写真の再送でも同じ値を送る
 */
export const UPLOAD_KEY_HEADER = 'Idempotency-Key'

/** 投稿キーの形式: 英数字とハイフンで 16〜64 文字（ブラウザは `crypto.randomUUID()` で作る） */
const UPLOAD_KEY_PATTERN = /^[0-9A-Za-z-]{16,64}$/

/** 投稿キーとして受け付ける値か */
export function isUploadKey(value: string): boolean {
  return UPLOAD_KEY_PATTERN.test(value)
}
