// 画面に出す文言。docs/spec/messages.md の全文言を持つ（NFR-21）。
// messages.md にない文言をここに足さない。差し込みのある文言は型のある関数にする。
import { type ErrorCode, isErrorCode } from '@wym/shared'

/** `{name}` のような部分に値を差し込む */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = values[key]
    return value === undefined ? whole : String(value)
  })
}

export type ErrorAudience = 'guest' | 'couple'

/** エラー文言の差し込み値 */
export type ErrorMessageParams = {
  /** PASSCODE_INVALID の残り回数 */
  remainingAttempts?: number
  /** PASSCODE_LOCKED の待ち時間（分） */
  minutes?: number
}

const sameForBoth = {
  TENANT_NOT_FOUND: 'この結婚式のページは見つかりませんでした',
  TENANT_SUSPENDED: '現在ご利用いただけません。しばらくしてからお試しください',
  TERMS_NOT_AGREED: '利用規約とプライバシーポリシーへの同意が必要です',
  FORBIDDEN: 'この操作はできません',
  NOT_FOUND: '見つかりませんでした。削除された可能性があります',
  RATE_LIMITED: 'アクセスが集中しています。少し時間をおいてお試しください',
  INTERNAL_ERROR: 'エラーが発生しました。時間をおいてもう一度お試しください',
} as const

/** 参加者向けのエラー文言（messages.md「エラー」） */
const guestErrors = {
  ...sameForBoth,
  UNAUTHENTICATED: '受付でお渡しした QR コードを読み取ってください',
  OUTSIDE_JOINING_PERIOD: '参加の受付期間ではありません。受付は結婚式の当日と翌日です',
  PERIOD_ENDED: '公開期間が終了しました。ご参加ありがとうございました',
  JOIN_TOKEN_INVALID: 'この QR コードは使えなくなっています。会場のスタッフにお問い合わせください',
  NICKNAME_TAKEN: 'この名前は使われています。別の名前を入力してください',
  FILE_TOO_LARGE: '写真のサイズが大きすぎます（10MB まで）',
  UNSUPPORTED_FILE_TYPE: 'この形式の写真は投稿できません（JPEG・PNG のみ）',
  UPLOAD_LIMIT_REACHED: '投稿できる枚数（100 枚）に達しました',
} as const

/** 新郎新婦向けのエラー文言（messages.md「エラー」） */
const coupleErrors = {
  ...sameForBoth,
  UNAUTHENTICATED: '管理者からお知らせした URL を開いてください',
  PERIOD_ENDED: '公開期間が終了しました。ご利用ありがとうございました',
  COUPLE_LINK_INVALID: 'この URL は使えなくなっています。管理者にお問い合わせください',
} as const

/** 差し込みのある新郎新婦向けのエラー文言 */
const passcodeErrors = {
  PASSCODE_INVALID: ({ remainingAttempts }: { remainingAttempts: number }) =>
    `パスコードが違います（あと ${remainingAttempts} 回）`,
  PASSCODE_LOCKED: ({ minutes }: { minutes: number }) =>
    `入力できる回数を超えました。約 ${minutes} 分後にお試しください`,
} as const

export const ja = {
  errors: {
    guest: guestErrors,
    couple: { ...coupleErrors, ...passcodeErrors },
    /** 通信エラー（画面内に表示し、「もう一度試す」を添える） */
    network: '通信できませんでした。電波の良い場所でもう一度お試しください',
    /** 入力エラー（`VALIDATION_ERROR` の項目ごと、`CONFIRMATION_MISMATCH`） */
    validation: {
      nicknameEmpty: 'ニックネームを入力してください',
      nicknameTooLong: 'ニックネームは 20 文字以内で入力してください',
      passcodeEmpty: 'パスコードを入力してください',
      tenantName: 'テナント名を 1〜50 文字で入力してください',
      eventDate: '開催日を選んでください',
      confirmationMismatch: 'テナント名が一致しません',
    },
  },

  common: {
    footer: {
      terms: '利用規約',
      privacy: 'プライバシーポリシー',
      contact: 'お問い合わせ',
    },
    nav: {
      home: 'ホーム',
      album: 'アルバム',
      upload: '投稿',
      seating: '席次表',
      course: '料理',
    },
    back: '戻る',
    retry: 'もう一度試す',
    /** 演出を飛ばすボタン（読み上げ用） */
    skipAnimation: '演出を飛ばす',
    photoAlt: ({ nickname }: { nickname: string }) => `${nickname} さんの写真`,
    likeCount: ({ count }: { count: number }) => `いいね ${count} 件`,
  },

  guest: {
    // SG-02
    nickname: {
      welcomeHeading: 'Welcome',
      welcomeDescription: 'アルバムに表示するニックネームを決めてください',
      /** 同意欄。リンクを差し込めるよう、リンクの前後で分けて持つ */
      agree: {
        terms: '利用規約',
        between: ' と ',
        privacy: 'プライバシーポリシー',
        after: ' に同意します',
      },
      welcomeSubmit: 'はじめる',
      changeHeading: 'ニックネームの変更',
      changeSubmit: '変更する',
    },
    // SG-03
    home: {
      greeting: ({ nickname }: { nickname: string }) => `こんにちは、${nickname} さん`,
      /** ニックネームの変更へのリンク（screen-details.md SG-03 のワイヤーフレーム） */
      change: '変更',
      /** アルバムのカードの新着写真の見出し（同上） */
      recent: '新着',
      cards: {
        seating: '席次表',
        course: '料理のコース',
        album: 'アルバム',
        upload: '写真を投稿する',
      },
    },
    // SG-04
    seating: {
      empty: '席次表は準備中です',
    },
    // SG-05
    course: {
      heading: '料理のコース',
      empty: 'コースのご案内は準備中です',
    },
    // SG-06
    album: {
      tabs: { timeline: 'タイムライン', ranking: 'ランキング' },
      filters: { all: 'すべて', mine: '自分の投稿' },
      remaining: ({ remaining }: { remaining: number }) => `あと ${remaining} 枚投稿できます`,
      empty: {
        timeline: 'まだ写真がありません。最初の 1 枚を投稿しましょう',
        mine: 'まだ投稿していません',
        ranking: 'まだいいねされた写真がありません',
      },
      rank: ({ rank }: { rank: number }) => `${rank} 位`,
    },
    // SG-07
    upload: {
      heading: '写真を投稿',
      camera: '撮影する',
      choose: '写真を選ぶ',
      submit: '投稿する',
      sending: '送信中…',
      failed: '送信できませんでした',
      retry: 'もう一度送る',
      another: '続けて投稿する',
      toAlbum: 'アルバムを見る',
    },
  },

  couple: {
    // SC-01
    entry: {
      heading: 'For the Couple',
      description: '管理者からお伝えしたパスコードを入力してください',
      submit: '入る',
    },
    // SC-02
    photos: {
      tabs: { all: 'すべての写真', ranking: 'ランキング' },
      uploaderFilter: ({ nickname }: { nickname: string }) => `投稿者: ${nickname}（すべて）`,
      empty: 'まだ写真がありません',
    },
  },

  admin: {
    // SA-01
    login: {
      google: 'Google でログイン',
      denied: 'このアカウントでは管理画面を利用できません',
    },
    // SA-02
    periodLabels: {
      preparation: '準備中',
      joining: '参加受付中',
      viewing: '閲覧期間',
      couple_only: '新郎新婦のみ',
      expired: '削除済み',
      suspended: '停止中',
    },
    // SA-04
    deletionDate: ({ date }: { date: string }) => `データの削除予定日: ${date}`,
    // SA-05
    passcodeNotice: 'パスコードはこの画面を離れると再表示できません',
    // SA-08
    previewNickname: 'プレビュー',

    // --- 管理面（前半、T16）。messages.md にない文言はワイヤーフレームの語と最小限のラベル ---
    logout: 'ログアウト',
    loginTitle: 'would-you-marry.me 管理',
    cancel: 'キャンセル',
    save: '保存する',
    add: '追加',
    remove: '削除',
    copy: 'コピー',
    moveUp: '上へ',
    moveDown: '下へ',
    // SA-02
    tenants: {
      heading: 'テナント',
      create: '＋ 作成',
      monitor: '監視',
      empty: 'テナントはまだありません',
      stats: ({ guests, photos }: { guests: string; photos: string }) =>
        `参加者 ${guests} / 写真 ${photos}`,
    },
    // SA-03
    create: {
      heading: 'テナントの作成',
      name: 'テナント名',
      eventDate: '開催日',
      submit: '作成する',
    },
    // SA-04
    detail: {
      period: ({ label }: { label: string }) => `期間: ${label}`,
      periodUntil: ({ label, until }: { label: string; until: string }) =>
        `期間: ${label}（${until} まで）`,
      suspend: '停止する',
      resume: '再開する',
      basic: '基本情報',
      edit: '編集',
      done: '完了',
      name: 'テナント名',
      eventDate: '開催日',
      seating: '席次表 PDF',
      seatingRegister: '登録',
      seatingReplace: '差し替え',
      seatingCheck: '確認',
      seatingNone: '未登録',
      course: 'コース表の画像',
      courseCount: ({ count }: { count: number }) => `${count} 枚`,
      urls: 'URL の発行',
      photos: '写真管理',
      guests: '参加者管理',
      preview: '参加者画面のプレビュー',
      usage: '利用状況',
      usageLine: ({
        guests,
        photos,
        likes,
        storage,
      }: {
        guests: string
        photos: string
        likes: string
        storage: string
      }) => `参加者 ${guests} / 写真 ${photos} / いいね ${likes} / ${storage}`,
      delete: 'このテナントを削除する',
      deleteConfirmLabel: 'テナント名',
      courseImageAlt: ({ index }: { index: number }) => `コース表の画像 ${index}`,
      courseImageDelete: {
        body: 'この画像を削除しますか？削除すると元に戻せません',
        confirm: '削除する',
        cancel: 'キャンセル',
      },
      seatingTooLarge: 'PDF のサイズが大きすぎます（20MB まで）',
      seatingUnsupported: 'PDF ファイルを選んでください',
      courseTooLarge: '画像のサイズが大きすぎます（10MB まで）',
      courseUnsupported: '画像は JPEG・PNG を選んでください',
    },
    // SA-05
    urls: {
      heading: 'URL の発行',
      joinTitle: '参加 URL（QR コード）',
      joinNone: '参加 URL はまだ発行されていません',
      joinPeriod: ({ from, to }: { from: string; to: string }) =>
        `参加できる期間: ${from} 〜 ${to}`,
      qrAlt: '参加 URL の QR コード',
      qrSave: 'QR コードを保存',
      reissue: '再発行',
      issue: '発行',
      coupleTitle: '新郎新婦用 URL',
      coupleNone: '新郎新婦用 URL はまだ発行されていません',
      passcode: 'パスコード',
      termsAgreed: '規約に同意済み',
      termsNotAgreed: '規約は未同意',
    },
    // SA-08（タブの名前は common.nav を使う）
    previewHeading: 'プレビュー',
    // SA-09
    guests: {
      empty: '参加者はまだいません',
      photoCount: ({ count }: { count: number }) => `${count} 枚`,
      changeBody: ({ nickname }: { nickname: string }) =>
        `「${nickname}」の新しい名前を入力してください`,
      nicknameLabel: 'ニックネーム',
    },
    // SA-06
    monitor: {
      heading: '監視',
      tenant: 'テナント',
      guests: '参加者',
      photos: '写真',
      likes: 'いいね',
      storage: '容量',
      openTool: '外部の監視ツールを開く',
    },
  },

  toasts: {
    photoUploaded: '写真を投稿しました',
    photoDeleted: '写真を削除しました',
    nicknameChanged: 'ニックネームを変更しました',
    downloadStarted: 'ダウンロードを開始しました',
    saveUnavailable: 'この画面では保存できません。メニューから「ブラウザで開く」を選んでください',
    copied: 'コピーしました',
    saved: '保存しました',
  },

  confirms: {
    deletePhotoGuest: {
      body: 'この写真を削除しますか？削除すると元に戻せません',
      confirm: '削除する',
      cancel: 'キャンセル',
    },
    deletePhotoAdmin: {
      body: 'この写真を削除しますか？参加者・新郎新婦の画面からも消え、元に戻せません',
      confirm: '削除する',
      cancel: 'キャンセル',
    },
    suspendTenant: {
      body: ({ name }: { name: string }) =>
        `「${name}」を停止しますか？参加者と新郎新婦は利用できなくなります`,
      confirm: '停止する',
      cancel: 'キャンセル',
    },
    resumeTenant: {
      body: ({ name }: { name: string }) => `「${name}」を再開しますか？`,
      confirm: '再開する',
      cancel: 'キャンセル',
    },
    deleteTenant: {
      body: ({ name }: { name: string }) =>
        `「${name}」のデータをすべて削除します。元に戻せません。確認のため、テナント名を入力してください`,
      confirm: '削除する',
      cancel: 'キャンセル',
    },
    reissueJoinUrl: {
      body: '参加 URL を再発行しますか？今の QR コードからは新しく参加できなくなります。参加済みの方はそのまま使えます',
      confirm: '再発行する',
      cancel: 'キャンセル',
    },
    reissueCoupleUrl: {
      body: '新郎新婦用 URL とパスコードを再発行しますか？今の URL とパスコードは使えなくなり、お二人にはもう一度入り直していただく必要があります',
      confirm: '再発行する',
      cancel: 'キャンセル',
    },
  },
} as const

export const messages = ja

export type Messages = typeof ja

/**
 * エラーコードから画面に出す文言を引く。
 * - `NICKNAME_REQUIRED`（ニックネーム登録画面へ移動する）と `VALIDATION_ERROR`（項目ごとの
 *   `messages.errors.validation` を使う）は文言を出さないので null を返す
 * - `CONFIRMATION_MISMATCH` は入力エラーの文言を返す
 * - 指定した向きに文言がない（messages.md で「—」）コードは、もう一方の向きの文言を返す
 * - `PASSCODE_INVALID` の `remainingAttempts` がないときは「パスコードが違います」だけを返す。
 *   `PASSCODE_LOCKED` の `minutes` がないときは 1 分とする
 */
export function errorMessage(
  code: ErrorCode,
  audience: ErrorAudience,
  params: ErrorMessageParams = {},
): string | null {
  if (code === 'NICKNAME_REQUIRED' || code === 'VALIDATION_ERROR') return null
  if (code === 'CONFIRMATION_MISMATCH') return ja.errors.validation.confirmationMismatch
  if (!isErrorCode(code)) return ja.errors.guest.INTERNAL_ERROR

  if (code === 'PASSCODE_INVALID') {
    return params.remainingAttempts === undefined
      ? 'パスコードが違います'
      : passcodeErrors.PASSCODE_INVALID({ remainingAttempts: params.remainingAttempts })
  }
  if (code === 'PASSCODE_LOCKED') {
    return passcodeErrors.PASSCODE_LOCKED({ minutes: params.minutes ?? 1 })
  }

  const own: Partial<Record<ErrorCode, string>> = audience === 'guest' ? guestErrors : coupleErrors
  const other: Partial<Record<ErrorCode, string>> =
    audience === 'guest' ? coupleErrors : guestErrors
  return own[code] ?? other[code] ?? ja.errors.guest.INTERNAL_ERROR
}
