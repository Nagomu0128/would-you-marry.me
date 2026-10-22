// 演出の長さ（秒）。design-guide.md「演出は 3 秒以内」
export const WELCOME_DURATION = 2.8
export const UPLOAD_COMPLETE_DURATION = 2.2
export const COUPLE_CELEBRATION_DURATION = 2.8
export const LIKE_BURST_DURATION = 0.8
export const RANKING_STEP = 0.55
export const RANKING_ITEM_DURATION = 0.5

// 記帳した紙が折り鶴になって飛び立つ（ニックネーム登録）。送信から鶴が画面の外へ出るまで約 2.4 秒
/** 紙が持ち上がり、折られて鶴になるまで */
export const ORIZURU_FOLD = 1.4
/** 鶴が羽ばたいて、画面の上の端の外へ出るまで */
export const ORIZURU_FLIGHT = 1.0
/** ニックネームの変更は短い版（合わせて約 1.6 秒） */
export const ORIZURU_FOLD_SHORT = 0.9
export const ORIZURU_FLIGHT_SHORT = 0.7
/** 通信を待って舞っていた鶴が、画面の外へ出るまで */
export const ORIZURU_EXIT = 0.55
/** 送信に失敗したとき: 鶴が降りてくる・紙に開き戻る */
export const ORIZURU_RETURN = 0.45
export const ORIZURU_UNFOLD = 0.6
/** 羽ばたき 1 回 */
export const ORIZURU_FLAP = 0.3
/** 芳名帳の一文字に墨がにじむ */
export const INK_BLEED = 0.76
