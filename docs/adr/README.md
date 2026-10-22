# ADR（Architecture Decision Record）

アーキテクチャ上の重要な決定と、その理由を記録する。

## 運用ルール

- 1 つの決定につき 1 ファイル。ファイル名は `NNNN-<英語の kebab-case タイトル>.md`（例: `0001-select-tech-stack.md`）
- 番号は連番。一度使った番号は再利用しない
- ステータス: 提案 / 承認 / 却下 / 置き換え済み
- 決定を覆すときは既存の ADR を書き換えず、新しい ADR を作る。古い ADR のステータスは「置き換え済み（ADR-NNNN）」にする
- 要件レベルの決定は [open-questions.md](../open-questions.md) の「決定済み」に記録し、技術・構成の決定を ADR に記録する

## 一覧

| ADR | タイトル | ステータス |
|---|---|---|
| [ADR-0001](0001-select-tech-stack.md) | 技術スタックの選定 | 承認 |
| [ADR-0002](0002-use-motion-for-animation.md) | UI のアニメーションに Motion を使う | 承認 |
| [ADR-0003](0003-dev-tools-and-repository-layout.md) | 開発ツールとリポジトリ構成 | 承認 |
| [ADR-0004](0004-wa-wedding-redesign-and-self-hosted-fonts.md) | 和の婚礼の意匠への再構成と、Web フォントの自前配信 | 承認 |

## テンプレート

```markdown
# ADR-NNNN: <タイトル>

- ステータス: 提案
- 日付: YYYY-MM-DD
- 関連: <US / FR / NFR / OQ の ID>

## コンテキスト

何を決める必要があるか。なぜ今決めるのか。前提と制約。

## 選択肢

### 選択肢 A: <名前>

- 概要:
- 利点:
- 欠点:

### 選択肢 B: <名前>

- 概要:
- 利点:
- 欠点:

## 決定

選んだ選択肢と、その理由。

## 影響

この決定で変わること、新たに必要になること、受け入れるトレードオフ。
```
