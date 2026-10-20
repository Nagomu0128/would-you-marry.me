// R2 のキー設計（docs/spec/database.md「R2 のキー設計」）と、テナント単位の削除

export type ImageContentType = 'image/jpeg' | 'image/png'

/** R2 の 1 回の一覧・削除の件数（R2 の上限） */
export const R2_BATCH_SIZE = 1000

function extensionOf(contentType: ImageContentType): 'jpg' | 'png' {
  return contentType === 'image/png' ? 'png' : 'jpg'
}

/** テナントのファイルすべてに共通するプレフィックス */
export function tenantPrefix(tenantId: string): string {
  return `tenants/${tenantId}/`
}

export type PhotoKeys = {
  original: string
  display: string
  thumb: string
}

/** 写真の 3 つの画像のキー */
export function photoKeys(
  tenantId: string,
  photoId: string,
  originalContentType: ImageContentType,
): PhotoKeys {
  const base = `${tenantPrefix(tenantId)}photos/${photoId}`
  return {
    original: `${base}/original.${extensionOf(originalContentType)}`,
    display: `${base}/display.jpg`,
    thumb: `${base}/thumb.jpg`,
  }
}

/** 席次表のキー。差し替えのたびに uploadId を変える */
export function seatingChartKey(tenantId: string, uploadId: string): string {
  return `${tenantPrefix(tenantId)}seating-chart/${uploadId}.pdf`
}

/** コース表の画像のキー */
export function courseMenuImageKey(
  tenantId: string,
  imageId: string,
  contentType: ImageContentType,
): string {
  return `${tenantPrefix(tenantId)}course-menu/${imageId}.${extensionOf(contentType)}`
}

/**
 * R2 の `tenants/{tenantId}/` 以下を 1,000 件ずつ一覧・削除する（テナント削除の手順 1）。
 * 途中で失敗した場合は例外を投げる。やり直しても安全。
 * @returns 削除したオブジェクトの数
 */
export async function deleteTenantObjects(bucket: R2Bucket, tenantId: string): Promise<number> {
  const prefix = tenantPrefix(tenantId)
  let deleted = 0
  for (;;) {
    const listed = await bucket.list({ prefix, limit: R2_BATCH_SIZE })
    if (listed.objects.length === 0) return deleted
    await bucket.delete(listed.objects.map((object) => object.key))
    deleted += listed.objects.length
    if (!listed.truncated) return deleted
  }
}
