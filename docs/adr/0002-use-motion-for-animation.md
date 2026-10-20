# ADR-0002: UI のアニメーションに Motion を使う

- ステータス: 承認
- 日付: 2026-10-20
- 関連: ADR-0001 / NFR-24, NFR-26 / [spec/design-guide.md](../spec/design-guide.md)

## コンテキスト

- プロダクトオーナーの方針として、UI 全体に Framer Motion を使い、Claude で作った短いモーショングラフィックスを組み込んで、リッチな UI にする
- 主な利用端末はスマートフォンで、式場の回線は不安定なことがある（NFR-10, NFR-24）
- Framer Motion は現在「Motion」に名前が変わっている（パッケージ名 `motion`）

## 選択肢

| 選択肢 | 評価 |
|---|---|
| Motion（旧 Framer Motion） | React と相性がよく、画面の切り替え、共有レイアウト（写真の拡大）、SVG のアニメーションまで 1 つで書ける。プロダクトオーナーの指定 |
| CSS アニメーションのみ | 軽いが、共有レイアウトや連続した演出を書くのが難しい |
| Lottie | デザインツールで作った演出を再生できるが、再生用のライブラリとデータが重く、Claude で作る流れに合わない |
| 動画ファイル | 表現の自由度は高いが、ファイルが大きく、式場の回線で読み込みが遅れる |

## 決定

- アニメーションには Motion を使う。React からは `motion/react` を読み込む
- モーショングラフィックスは Claude で作成し、SVG と Motion で書いた React コンポーネントとして組み込む（`packages/ui/src/motion/`）
- バンドルを小さくするため、`LazyMotion` と `m` コンポーネントを使う
- `MotionConfig` の `reducedMotion="user"` を設定し、端末の「動きを減らす」設定に従う（NFR-26）

## 影響

- JavaScript のバンドルが増えるので、`LazyMotion` で必要な機能だけを読み込む
- 古い端末で動きが重くならないよう、動かすのは transform と opacity だけにし、実機で確認する
- 演出はタップで飛ばせるようにし、操作を止めない（[design-guide.md](../spec/design-guide.md#モーション)）
