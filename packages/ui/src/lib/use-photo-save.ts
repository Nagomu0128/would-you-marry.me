import { useCallback, useRef } from 'react'
import { useToast } from '../components/Toast'
import { ja } from '../messages/ja'
import { type SavePhotoResult, savePhoto } from './save-photo'

/** 保存に必要な写真の項目（`Photo` の一部） */
export type SavablePhoto = { id: string; urls: { original: string } }

/** 結果に応じたトーストの文言。出さない結果は null */
export function savePhotoMessage(result: SavePhotoResult): string | null {
  switch (result.status) {
    case 'downloaded':
      return ja.toasts.downloadStarted
    case 'unsupported':
      return ja.toasts.saveUnavailable
    case 'needs-tap':
      return ja.toasts.savePressAgain
    case 'failed':
      return ja.errors.network
    default:
      return null
  }
}

/**
 * 写真の保存を行う関数を返す（`PhotoViewer` の `onSave` に渡す）。結果に応じたトーストを出す。
 * 取得は済んだが共有メニューを開けなかった（`needs-tap`）写真は覚えておき、同じ写真で
 * もう一度呼ばれたら取得せずに共有メニューを開く。
 * 呼び出しの完了まで待てるので、`PhotoViewer` は保存中の表示ができる。
 */
export function usePhotoSave(): (photo: SavablePhoto) => Promise<void> {
  const toast = useToast()
  const pending = useRef<{ photoId: string; file: File } | null>(null)

  return useCallback(
    async (photo: SavablePhoto) => {
      const held = pending.current?.photoId === photo.id ? pending.current.file : undefined
      pending.current = null
      const result = await savePhoto({
        photoId: photo.id,
        originalUrl: photo.urls.original,
        ...(held ? { file: held } : {}),
      })
      if (result.status === 'needs-tap') pending.current = { photoId: photo.id, file: result.file }
      const message = savePhotoMessage(result)
      if (message) toast.show(message)
    },
    [toast],
  )
}
