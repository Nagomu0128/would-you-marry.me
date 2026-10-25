// 画面に出す文言。docs/spec/messages.md の全文言を持つ（NFR-21）。
// messages.md にない文言をここに足さない（装飾の言葉を足したときは messages.md にも載せる）。
// 差し込みのある文言は型のある関数にする。
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
    /** 本文へのスキップリンク */
    skipToContent: '本文へ移動',
    /** 下部ナビゲーション・フッターのリンク群の読み上げ名 */
    navLabel: 'メインメニュー',
    footerLabel: 'ご利用について',
    /** 画面（ルート）の読み込みに失敗したとき */
    routeError: {
      message: '画面を読み込めませんでした。電波の良い場所でもう一度お試しください',
      reload: '画面を読み込み直す',
    },
    /** 演出を飛ばすボタン（読み上げ用） */
    skipAnimation: '演出を飛ばす',
    /** 画面の読み込み中（読み上げ用） */
    loading: '読み込み中',
    photoAlt: ({ nickname }: { nickname: string }) => `${nickname} さんの写真`,
    likeCount: ({ count }: { count: number }) => `いいね ${count} 件`,
    /** 投稿者の表示（拡大表示・ランキング。screen-details.md のワイヤーフレーム） */
    uploader: ({ nickname }: { nickname: string }) => `${nickname} さん`,
    /** 写真の拡大表示のボタン（保存・削除はワイヤーフレームの語、残りは読み上げ用） */
    viewer: {
      close: '閉じる',
      save: '保存',
      delete: '削除',
      like: 'いいね',
      unlike: 'いいねを取り消す',
      /** 前後の写真へ移るボタン（読み上げ用） */
      previous: '前の写真',
      next: '次の写真',
    },
  },

  guest: {
    // SG-02
    nickname: {
      /** おふたりからの招き（初回）。名前と日付の下に置く */
      welcomeHeading: '本日はようこそお越しくださいました',
      welcomeDescription: '受付の芳名帳に、お名前をご記帳ください',
      /** 入力欄のラベルと補足 */
      label: 'ニックネーム',
      hint: 'アルバムの写真に添えて表示されます。あとから変更できます',
      /** 芳名帳の紙の見出し（縦書き）と、名前が空のときの薄墨の案内 */
      sheetHeading: '御芳名',
      sheetPlaceholder: 'お名前',
      /** 送信してから画面が移るまで（読み上げと、通信を待つあいだの表示） */
      sending: '記帳しています',
      /** 同意欄。リンクを差し込めるよう、リンクの前後で分けて持つ */
      agree: {
        terms: '利用規約',
        between: ' と ',
        privacy: 'プライバシーポリシー',
        after: ' に同意します',
      },
      welcomeSubmit: '記帳する',
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
      // --- 以下は表紙と入口の装飾の言葉（design-guide.md「画面ごとの見立て」） ---
      /** 表紙の日付の下の一行 */
      welcomeLine: '本日はようこそお越しくださいました',
      /** 祝儀袋の表書きと、袋の下の添え書き */
      giftOmote: '写真を贈る',
      giftNote: '撮った一枚を、おふたりのアルバムへ',
      /** 席札・御品書きの段の見出しと、札の添え書き */
      guideHeading: '本日のご案内',
      seatingNote: 'お席のご案内',
      courseNote: '本日のお料理',
      courseMark: '御品書',
      /** アルバムの段 */
      albumHeading: 'みんなのアルバム',
      openAlbum: 'アルバムを見る',
      albumEmpty: 'まだ写真がありません。最初の一枚を、お待ちしています',
    },
    // SG-04
    seating: {
      empty: '席次表は準備中です',
      lead: 'お席をご確認のうえ、どうぞごゆっくりお過ごしください',
      zoomHint: '席次表をタップして拡大し、指で動かせます',
      openHint: 'タップで拡大・指で移動',
      openPage: ({ page }: { page: number }) => `席次表 ${page} ページ目を拡大`,
      /** PDF の各ページの代替テキスト */
      pageAlt: ({ page }: { page: number }) => `席次表 ${page} ページ目`,
      /** 額の題箋（装飾） */
      mark: '御席次',
    },
    // SG-05
    course: {
      heading: '料理のコース',
      empty: 'コースのご案内は準備中です',
      lead: 'おふたりから、感謝を込めたおもてなしです',
      /** 各画像の代替テキスト */
      imageAlt: ({ index }: { index: number }) => `料理のコース ${index}`,
      zoomHint: 'タップで拡大',
      /** 額の題箋（装飾） */
      mark: '御品書',
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
      /** プレビュー画像の代替テキスト（読み上げ用） */
      previewAlt: '選んだ写真',
      lead: '笑顔も、乾杯も、何気ないひとときも。あなたの一枚を、おふたりのアルバムへ',
      rules: '1 回に 1 枚・JPEG / PNG・10MB まで',
      /** 台紙の空いた枠に添える言葉 */
      slot: 'ここに一枚を',
      doneHeading: '思い出を、ありがとうございます',
      doneNote: '写真をアルバムに届けました',
      /** 貼った写真に押す朱印の文字（装飾） */
      seal: '寿',
    },
  },

  couple: {
    // SC-01
    entry: {
      heading: 'おふたりへ',
      description: '管理者からお伝えしたパスコードを入力してください',
      /** 包みの下の添え書き */
      note: 'みなさまが撮った今日の写真を、お届けします',
      submit: '入る',
      /** パスコード入力欄のラベル（screen-details.md SC-01 のワイヤーフレーム） */
      passcodeLabel: 'パスコード',
    },
    // SC-02
    photos: {
      tabs: { all: 'すべての写真', ranking: 'ランキング' },
      uploaderFilter: ({ nickname }: { nickname: string }) => `投稿者: ${nickname}（すべて）`,
      empty: 'まだ写真がありません',
      /** 投稿者を選んだとき・選ぶ一覧の見出し・件数（screen-details.md SC-02 のワイヤーフレーム） */
      uploaderSelected: ({ nickname }: { nickname: string }) => `投稿者: ${nickname}`,
      uploaderAll: 'すべて',
      uploaderSheetTitle: '投稿者',
      uploaderPhotoCount: ({ count }: { count: number }) => `${count} 枚`,
      /** 見出しの帯の添え書き */
      lead: 'みなさまから届いた写真',
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
    // SA-07
    photos: {
      empty: 'まだ写真がありません',
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
    // --- 準備帳（2026-10 の再構成で足した、管理画面の補助と見出しの文言）---
    book: {
      skipToMain: '本文へ移動',
      nav: '管理メニュー',
      loading: '読み込み中',
      loginNote: '許可された Google アカウントでログインしてください',
      createNote: '開催日から、参加受付と閲覧の期間が自動で決まります',
      materials: '当日の資料',
      records: '参加者と写真',
      danger: '取り消せない操作',
      seatingRegistered: '登録済み',
      photosNote: '写真を開くと、保存と削除ができます',
      previewNote: '参加者と同じ画面を表示します。リンクとボタンは押せません',
      monitorCaption: '結婚式ごとの利用状況',
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
    /** 写真の保存で、取得は済んだがもう一度タップしないと共有メニューを開けないとき（iPhone の Safari） */
    savePressAgain: '準備ができました。もう一度「保存」を押してください',
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

  /** 全画面の演出に添える言葉（design-guide.md「モーション」） */
  ceremony: {
    /** 初回ホーム: 金屏風が開いて、おふたりの名前の上に出る */
    welcome: {
      greeting: 'ようこそお越しくださいました',
    },
    /** 新郎新婦の初回入室: 二羽の鶴が並んだあとに出る */
    couple: {
      congrats: 'ご結婚おめでとうございます',
      note: 'みなさまからの写真が届いています',
    },
    /** 投稿完了: 朱印を押したあとに出る */
    upload: {
      thanks: 'すてきな一枚を ありがとうございます',
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
