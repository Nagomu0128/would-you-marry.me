import { COURSE_MENU_IMAGE_MAX_BYTES, type CourseMenuImage } from '@wym/shared'
import { Button, ConfirmSheet, ja, useToast } from '@wym/ui'
import { domMax, LazyMotion, Reorder } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { messageOf } from '../lib/errors'

const IMAGE_TYPES = ['image/jpeg', 'image/png']

type Props = {
  tenantId: string
  initialImages: CourseMenuImage[]
  /** 枚数が変わったとき（一覧の「N 枚」を更新する） */
  onChange: (images: CourseMenuImage[]) => void
  onClose: () => void
}

/** コース表の画像の編集: 追加・削除（確認あり）・ドラッグでの並べ替え。御品書きの頁を綴じ直すように並べる */
export function CourseMenuEditor({ tenantId, initialImages, onChange, onClose }: Props) {
  const toast = useToast()
  const [images, setImages] = useState(initialImages)
  const [deleting, setDeleting] = useState<CourseMenuImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const latest = useRef(images)
  latest.current = images
  const fileInput = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    onChangeRef.current(images)
  }, [images])

  async function persistOrder(order: CourseMenuImage[]) {
    try {
      await api.reorderCourseMenu(
        tenantId,
        order.map((i) => i.id),
      )
      toast.show(ja.toasts.saved)
    } catch (error) {
      toast.show(messageOf(error))
      try {
        setImages((await api.getCourseMenu(tenantId)).images)
      } catch {
        // 読み直せなくても、エラーはトーストで知らせ済み
      }
    }
  }

  /** ドラッグ中の並び（画面だけ） */
  function handleReorder(ids: string[]) {
    const byId = new Map(images.map((i) => [i.id, i]))
    setImages(ids.flatMap((id) => byId.get(id) ?? []))
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= images.length) return
    const next = [...images]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(target, 0, item)
    setImages(next)
    void persistOrder(next)
  }

  async function handleAdd(file: File | undefined) {
    if (!file) return
    setFileError(null)
    if (!IMAGE_TYPES.includes(file.type)) return setFileError(ja.admin.detail.courseUnsupported)
    if (file.size > COURSE_MENU_IMAGE_MAX_BYTES) {
      return setFileError(ja.admin.detail.courseTooLarge)
    }
    setBusy(true)
    try {
      const { image } = await api.addCourseMenuImage(tenantId, file)
      setImages((prev) => [...prev, image])
      toast.show(ja.toasts.saved)
    } catch (error) {
      toast.show(messageOf(error))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await api.deleteCourseMenuImage(tenantId, deleting.id)
      setImages((prev) => prev.filter((i) => i.id !== deleting.id))
      toast.show(ja.toasts.saved)
    } catch (error) {
      toast.show(messageOf(error))
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  const t = ja.admin.detail
  return (
    <div className="admin-course">
      {/* Reorder は全機能版の Motion を使うため、この中だけ厳格モードを外して読み込む */}
      <LazyMotion features={domMax}>
        <Reorder.Group
          axis="y"
          values={images.map((i) => i.id)}
          onReorder={handleReorder}
          className="admin-course-list"
        >
          {images.map((image, index) => (
            <Reorder.Item
              key={image.id}
              value={image.id}
              onDragEnd={() => void persistOrder(latest.current)}
              className="admin-course-item"
            >
              <span className="admin-course-no" aria-hidden="true">
                {index + 1}
              </span>
              <img
                src={image.url}
                alt={t.courseImageAlt({ index: index + 1 })}
                draggable={false}
                className="admin-course-thumb"
              />
              <span className="admin-course-grip" aria-hidden="true" />
              <div className="admin-course-actions">
                <Button
                  variant="text"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`${ja.admin.moveUp} ${index + 1}`}
                >
                  {ja.admin.moveUp}
                </Button>
                <Button
                  variant="text"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`${ja.admin.moveDown} ${index + 1}`}
                >
                  {ja.admin.moveDown}
                </Button>
                <Button
                  variant="text"
                  className="admin-danger-text"
                  onClick={() => setDeleting(image)}
                  aria-label={`${ja.admin.remove} ${index + 1}`}
                >
                  {ja.admin.remove}
                </Button>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </LazyMotion>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        data-testid="course-file"
        onChange={(e) => void handleAdd(e.target.files?.[0])}
      />
      {fileError ? (
        <p role="alert" className="admin-row-error">
          {fileError}
        </p>
      ) : null}
      <div className="admin-course-foot">
        <Button variant="secondary" loading={busy} onClick={() => fileInput.current?.click()}>
          {ja.admin.add}
        </Button>
        <Button variant="text" className="admin-quiet" onClick={onClose}>
          {t.done}
        </Button>
      </div>

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        body={t.courseImageDelete.body}
        confirmLabel={t.courseImageDelete.confirm}
        cancelLabel={t.courseImageDelete.cancel}
        danger
        loading={busy}
      />
    </div>
  )
}
