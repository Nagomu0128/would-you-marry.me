/**
 * 期間の判定に使う現在時刻。サーバー側の判定はすべてここから取る
 * （1 か所にまとめておくと、後から差し替えやすい）。
 */
export function now(): Date {
  return new Date()
}
