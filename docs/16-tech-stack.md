# 技術選定

`~/.claude/docs/stack-inventory.md`（全プロジェクト共通のスタック台帳）に突き合わせた結果。
**台帳の標準構成から意図的に外すのは1点だけ**で、理由は `docs/adr/0007` に記録する。

## 台帳の標準構成との対応

| 層 | 台帳の標準 | 本プロジェクト | 差分の理由 |
|---|---|---|---|
| フレームワーク | Next.js (App Router) | **Vite + React** | ローカルファーストで SSR / Server Components を一切使わないため（`adr/0007`） |
| 言語 | TypeScript | TypeScript | 同じ |
| CSS | Tailwind v4 | Tailwind v4 | 同じ |
| UI | shadcn/ui | shadcn/ui | 同じ（Vite でも動く） |
| DB / 認証 | Supabase | **Supabase（速報公開のみ・任意）** | 大会データの正は端末内。サーバは閲覧ページ配信だけ |
| ホスティング | Vercel | Vercel | 同じ |

台帳にある派生「**Vite + PWA + Cloudflare Workers｜オフライン必須の軽量アプリ**（tabinoshiori）」が
この案件の型に最も近い。ただし tabinoshiori は README のみで実装がないため、参照できる実績はない。
ホスティングは Cloudflare Workers ではなく、台帳で最も使われている **Vercel** に寄せる。

---

## 構成

```
[運営端末（オフラインで完結）]
  Vite + React + TypeScript
  Tailwind v4 + shadcn/ui
  vite-plugin-pwa（Service Worker / オフラインキャッシュ）
  Dexie（IndexedDB）        ← 大会データの正
  ドメイン層（純粋 TypeScript・外部依存なし）
        │
        │  電波があるときだけ、全量スナップショットを一方向で送る
        ▼
[Supabase  ap-northeast-1]   ← v1 では P1。間に合わなければ作らない
  tournaments テーブル1つ（id / token_hash / snapshot jsonb / updated_at）
        │
        ▼
[Vercel] 閲覧ページ（観戦者向け・読み取り専用）
```

## 採用するもの

### 運営アプリ

| 技術 | 用途 | 判断理由 |
|---|---|---|
| **Vite + React + TypeScript** | アプリ本体 | SSR を使わない。ビルドが速く、PWA 構成が素直（`adr/0007`） |
| **Tailwind v4** | スタイル | 台帳の標準。印刷用 CSS も同じ系で書ける |
| **shadcn/ui** | UI 部品 | 台帳の標準。**ただし採用は最小限にする**（後述） |
| **vite-plugin-pwa** | Service Worker | 事前キャッシュ。電波なしで URL を開いて起動できる（ADR-0004 の前提） |
| **Dexie** | IndexedDB ラッパ | 即時永続化・世代バックアップ・トランザクションが素直に書ける |
| **Vitest** | テスト | ドメイン層のテストを最優先で整備する（`docs/05` T-01〜T-20） |

### 速報公開（P1・任意）

| 技術 | 用途 | 判断理由 |
|---|---|---|
| **Supabase** | スナップショット置き場 | 台帳にあり、CLI もログイン済み。org-id `lkqwpkbtjzqtrcrgsipt` / region **`ap-northeast-1`** |
| **Vercel** | 閲覧ページ配信 | 台帳で最も使われている。運営アプリと同じ場所に置ける |

**サーバはロジックを持たない。** テーブル1つと、公開用の読み取りだけ。
運営端末は大会ごとの更新トークンでスナップショットを PUT する。冪等。

### エラー監視

| 技術 | 用途 | 条件 |
|---|---|---|
| **Sentry** | クラッシュ検知 | 台帳にあり（`tagoken_web/web/.env.local`） |

年1回の大会で落ちると翌年はない。監視は入れる価値がある。ただし**条件を厳格に付ける**。

- **選手の氏名・所属・生年月日を送らない。** `beforeSend` で大会データを丸ごと除去する
- オフライン時はキューに積み、通信が戻ったときに送る。**送信失敗が画面を止めない**
- 未成年を含むデータを扱うため、ブレッドクラムの自動収集（入力値の記録）を無効にする

## 採用しないもの（台帳にあるが使わない）

| 技術 | 理由 |
|---|---|
| **Next.js** | ローカルファーストで SSR / Server Components を使わない。持ち込む理由がない → `adr/0007` |
| **Supabase Auth** | アカウント登録を要求しない（N-6-7）。認証は公開ページの更新トークンのみ |
| **Stripe** | 課金を設計しない（`docs/01-scope.md`） |
| **Resend** | v1 でメール送信の要件がない |
| **LINE Messaging API** | v1 で通知の要件がない。v2 で検討 |
| **PostHog** | **未成年の氏名を含む画面でセッション記録・イベント収集を行わない。** N-8-5（判断回数）の測定は端末内のカウンタで足りる |
| **Anthropic / OpenAI / Gemini** | **要項テキストの推定はキーワード照合で行う。** オフラインで動く必要があり、LLM は前提にできない（`docs/15-ui-ux.md` 仕掛け4） |
| **Cloudflare Workers** | 台帳の派生にあるが、Vercel に寄せたほうが台帳の主流に近く、運営アプリと配信先を揃えられる |
| **Docker / supabase start** | 台帳に「**Docker はインストールされていない**」と記録あり。開発もクラウドの Supabase に繋ぐ |

## shadcn/ui の使い方に条件を付ける

台帳の標準だが、**この製品の UI 要件は一般的な管理画面と違う。**

| 使う | 使わない |
|---|---|
| Button / Input / Badge / Card / Table / Tabs / Toast | **Dialog（モーダル）は原則使わない**（UX原則4） |
| Select / Popover（詳細設定の中だけ） | Tooltip（タッチ端末で機能しない） |
| Separator / ScrollArea | Command（⌘K。年1回の利用者は覚えていない） |

- **テンキー・スコア入力欄は自作する。** 44px 以上のタップ領域と自動フォーカス移動が必要で、
  既製の Input では満たせない（`docs/15-ui-ux.md` 第2部5）
- Toast は Undo 付きで5秒表示。既定の挙動を上書きする
- 既定のフォントサイズを使わない。文字サイズ3段階の切替に追従させる

## Supabase の扱い

### v1 では新規プロジェクトを作らない

速報公開は **P1（間に合わなければ落とす）** である。
台帳に「追加プロジェクトは有料プランで**月$10前後の課金が乗る**」と記録がある。
**無料提供のツールのために固定費を増やさない。**

速報公開を実装する段階で、次のいずれかを選ぶ。

1. 既存プロジェクトに相乗りする（テーブル1つなので影響が小さい）
2. 新規に作る（`supabase projects create badminton-mg --org-id lkqwpkbtjzqtrcrgsipt --region ap-northeast-1`）

台帳の注意：hojyokare が Singapore、smasro_web が Sydney になっている。
**新規は必ず `ap-northeast-1`（Tokyo）を指定する。**

### スキーマ（実装するときの案）

```sql
create table public.tournaments (
  id          text primary key,          -- 大会ID（端末側で生成）
  token_hash  text not null,             -- 更新トークンのハッシュ
  snapshot    jsonb not null,            -- 大会データの全量
  updated_at  timestamptz not null default now()
);

-- 閲覧は誰でも。更新は RPC 経由でトークン検証してから
alter table public.tournaments enable row level security;
create policy "read_public" on public.tournaments for select using (true);
```

**個人情報の公開範囲は端末側で絞ってから送る。** サーバに生の名簿を置かない（N-6-4 / N-6-6）。
生年月日・連絡先はスナップショットに含めない。

---

## ローカル環境（台帳より）

```
Node v24.12.0 / npm 11.6.2 / pnpm / supabase CLI / gh / psql 16
Playwright chromium キャッシュ済み（~/Library/Caches/ms-playwright/）
Docker なし
```

Playwright があるため、**印刷レイアウトの検証を自動化できる**。
A4 の PDF 出力を人数別に生成して目視確認する手順を、実装時に用意する。

## 立ち上げ手順（実装着手時）

台帳の手順から、Supabase を後回しにした版。

```bash
# 1. アプリ本体
npm create vite@latest . -- --template react-ts
npm i -D tailwindcss @tailwindcss/vite vite-plugin-pwa vitest
npm i dexie
npx shadcn@latest init

# 2. ドメイン層を先に作る（UI より先）
mkdir -p src/domain/{scoring,ranking,draw,advancement}
mkdir -p src/domain/__tests__      # docs/05 の T-01〜T-20 をここに置く

# 3. .gitignore に .env*.local と .secrets/ が入っていることを確認

# 4. Supabase は速報公開に着手するときまで作らない
```

**ドメイン層のテストが通るまで、UI のパッケージを1つも入れない。**
実装順序は `docs/12-roadmap.md` に従う。
