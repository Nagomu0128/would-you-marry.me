# would-you-marry.me ドキュメント

結婚式当日に参加者が使う、マルチテナントの Web アプリケーションの要件・設計ドキュメント。

- 最終更新: 2026-10-20
- 段階: 要件定義 + 基本設計（技術スタックは未選定）

## 読む順番

1. [プロダクト概要](overview.md) — 何を作るのか、誰が使うのか、テナントの期間、用語
2. [ユーザーストーリー](requirements/user-stories.md) — 誰が・どうやって・何ができるか
3. 機能要件 — [管理面](requirements/functional-admin.md) / [ユーザー画面](requirements/functional-guest.md) / [新郎新婦用ページ](requirements/functional-couple.md)
4. [非機能要件](requirements/non-functional.md)
5. 基本設計 — [画面](design/screens.md)、[ドメインモデル](design/domain-model.md)、[認証・認可](design/auth.md)、[テナント分離](design/multi-tenancy.md)、[アーキテクチャ](design/architecture.md)
6. [未決事項・決定済み事項](open-questions.md) — これから決めること・決めたこと

## ドキュメント一覧

| 区分 | ドキュメント | 内容 | ステータス |
|---|---|---|---|
| 概要 | [overview.md](overview.md) | 目的、アクター、テナントの期間、利用の流れ、用語集 | ドラフト |
| 要件 | [requirements/user-stories.md](requirements/user-stories.md) | ユーザーストーリーと機能要件・画面への対応表 | ドラフト |
| 要件 | [requirements/functional-admin.md](requirements/functional-admin.md) | 管理面の機能要件 | ドラフト |
| 要件 | [requirements/functional-guest.md](requirements/functional-guest.md) | ユーザー画面の機能要件 | ドラフト |
| 要件 | [requirements/functional-couple.md](requirements/functional-couple.md) | 新郎新婦用ページの機能要件 | ドラフト |
| 要件 | [requirements/non-functional.md](requirements/non-functional.md) | 非機能要件と想定規模 | ドラフト |
| 設計 | [design/screens.md](design/screens.md) | 画面一覧・画面遷移 | ドラフト |
| 設計 | [design/domain-model.md](design/domain-model.md) | 論理エンティティと関係 | ドラフト |
| 設計 | [design/auth.md](design/auth.md) | 参加者・新郎新婦・管理者の認証と認可 | ドラフト |
| 設計 | [design/multi-tenancy.md](design/multi-tenancy.md) | テナント分離の方針 | ドラフト |
| 設計 | [design/architecture.md](design/architecture.md) | 論理構成と技術選定の候補比較 | ドラフト（技術未選定） |
| 決定記録 | [adr/README.md](adr/README.md) | アーキテクチャ決定記録（ADR）の運用 | 運用ルールのみ |
| 管理 | [open-questions.md](open-questions.md) | 未決事項・決定済み事項 | 随時更新 |

## ID の付け方

| 接頭辞 | 意味 | 定義場所 |
|---|---|---|
| `US-A-xx` / `US-G-xx` / `US-C-xx` | ユーザーストーリー（管理者 / 参加者 / 新郎新婦） | [user-stories.md](requirements/user-stories.md) |
| `FR-A-xx` / `FR-G-xx` / `FR-C-xx` | 機能要件（管理面 / ユーザー画面 / 新郎新婦用ページ） | [functional-admin.md](requirements/functional-admin.md) / [functional-guest.md](requirements/functional-guest.md) / [functional-couple.md](requirements/functional-couple.md) |
| `NFR-xx` | 非機能要件 | [non-functional.md](requirements/non-functional.md) |
| `SA-xx` / `SG-xx` / `SC-xx` | 画面（管理面 / ユーザー画面 / 新郎新婦用ページ） | [screens.md](design/screens.md) |
| `OQ-xx` | 未決事項 | [open-questions.md](open-questions.md) |
| `D-xx` | 決定済み事項 | [open-questions.md](open-questions.md) |
| `ADR-NNNN` | アーキテクチャ決定記録 | [adr/](adr/README.md) |

## 記述ルール

- プロダクトオーナーが決めていない内容は「仮置き」と書く。判断が必要な論点は `OQ-xx` として [open-questions.md](open-questions.md) に挙げる
- 決定済みの内容には、根拠として `D-xx` を添える
- 特定の技術・サービス名は [design/architecture.md](design/architecture.md) と [adr/](adr/README.md) 以外では使わない（技術選定前のため）
- 図は Mermaid で書く
- 未決事項が決まったら [open-questions.md](open-questions.md) で「決定済み」に移し、影響するドキュメントを更新する
