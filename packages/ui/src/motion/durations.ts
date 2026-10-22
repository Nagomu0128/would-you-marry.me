// 演出の長さ（秒）。design-guide.md「モーション」の表
/** 初回ホーム: 金屏風が開いて、おふたりの名前が現れる（最大 3.6 秒） */
export const WELCOME_DURATION = 3.6
/** 投稿完了: 写真が和紙に置かれ、「寿」の朱印が押される（最大 2.4 秒） */
export const UPLOAD_COMPLETE_DURATION = 2.4
/** 新郎新婦の初回入室: 二羽の鶴が舞い込んで並ぶ（最大 3.6 秒） */
export const COUPLE_CELEBRATION_DURATION = 3.6
/** 全画面の演出の終わりに、舞台が溶けて元の画面に戻るまでの長さ */
export const CEREMONY_FADE_OUT = 0.5
/** いいね: ハートが弾み、梅の花びらと金の粒が散る（担当: micro） */
export const LIKE_BURST_DURATION = 0.9
export const RANKING_STEP = 0.55
export const RANKING_ITEM_DURATION = 0.6

// 小さな演出（担当: micro）。design-guide.md「モーション」の一覧
/** ランキング: 1 位の登場の開始から、額縁に光が走り、水引が結ばれ終わるまで */
export const RANKING_FIRST_FLOURISH = 1.45
/** 画面の切り替え（0.35 秒以内）。不透明度はこれより短く、位置はこの長さで落ち着く */
export const PAGE_TRANSITION_DURATION = 0.34
/** スクロールで初めて画面に入った段の立ち上がり */
export const REVEAL_DURATION = 0.5
/*
 * CSS だけで動く演出の長さ（micro.css に同じ値を書く）
 * - 読み込みの水引: 結んでほどくまで 2.8 秒の繰り返し。速い読み込みでちらつかないよう 0.3 秒待ってから出す
 * - スケルトンの光: 3.2 秒の繰り返し
 * - 金のきらめき（.wa-kin-sheen）: 表示時に 1.4 秒で一度通り、その後は 11 秒周期
 */
