/** 金のきらめきを付けるクラス（micro.css）。付けた要素の上を光の帯が通る */
export const KIN_SHEEN_CLASS = 'wa-kin-sheen'
/** 画面の外にある間に付ける属性。micro.css がこの間アニメーションを止める */
export const KIN_SHEEN_OFFSCREEN_ATTR = 'data-wa-offscreen'

const SELECTOR = `.${KIN_SHEEN_CLASS}`

/**
 * `.wa-kin-sheen` の要素を見張り、画面の外にある間はきらめきを止める（design-guide.md「画面外では止める」）。
 * 後から追加された要素・クラスを付け外しされた要素も追う。戻り値で見張りをやめる。
 * IntersectionObserver が使えない環境では何もしない（きらめきは CSS だけで動き続ける）。
 */
export function watchKinSheen(root: Element = document.documentElement): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const watched = new Set<Element>()
  // きらめきの要素が現れるまで作らない（多くの画面には無い）
  let visibility: IntersectionObserver | null = null
  const observer = () => {
    visibility ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!watched.has(entry.target)) continue
        entry.target.toggleAttribute(KIN_SHEEN_OFFSCREEN_ATTR, !entry.isIntersecting)
      }
    })
    return visibility
  }

  const watch = (el: Element) => {
    if (watched.has(el)) return
    watched.add(el)
    observer().observe(el)
  }
  const unwatch = (el: Element) => {
    if (!watched.delete(el)) return
    visibility?.unobserve(el)
    el.removeAttribute(KIN_SHEEN_OFFSCREEN_ATTR)
  }
  const scan = (node: Node) => {
    if (!(node instanceof Element)) return
    if (node.matches(SELECTOR)) watch(node)
    for (const el of node.querySelectorAll(SELECTOR)) watch(el)
  }
  const release = (node: Node) => {
    if (!(node instanceof Element)) return
    for (const el of [...watched]) {
      if (node === el || node.contains(el)) unwatch(el)
    }
  }

  scan(root)
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const el = record.target
        if (!(el instanceof Element)) continue
        if (el.matches(SELECTOR)) watch(el)
        else unwatch(el)
        continue
      }
      for (const node of record.removedNodes) release(node)
      for (const node of record.addedNodes) scan(node)
    }
  })
  mutations.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  return () => {
    mutations.disconnect()
    visibility?.disconnect()
    for (const el of watched) el.removeAttribute(KIN_SHEEN_OFFSCREEN_ATTR)
    watched.clear()
  }
}
