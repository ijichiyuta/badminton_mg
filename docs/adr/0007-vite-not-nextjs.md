# ADR-0007 Vite を使い、標準構成の Next.js から外れる

日付: 2026-09-13 / 状態: 採択

## 背景
`~/.claude/docs/stack-inventory.md` の標準構成は
**Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Supabase → Vercel** であり、
全11リポジトリでこの型が使われている。台帳には「迷ったらこれ」と書かれている。

一方、本プロジェクトは ADR-0001（ローカルファースト）と ADR-0004（PWA）により、
**サーバサイドレンダリングを一切使わない**。データの正は端末内の IndexedDB にあり、
サーバはスナップショットの置き場と閲覧ページの配信しか担わない。

## 決定
運営アプリは **Vite + React + TypeScript** で作る。Next.js を使わない。
Tailwind v4 / shadcn/ui / Vercel は標準構成のまま維持する。

閲覧ページ（観戦者向け・読み取り専用）は別で、Next.js を使ってもよい。

## 理由
- **App Router / Server Components / Server Actions を1つも使わない。**
  使わない機能のために設定とビルド時間を払う理由がない
- Next.js の静的書き出し（`output: 'export'`）+ Service Worker は組み合わせに癖がある。
  `vite-plugin-pwa` のほうが事前キャッシュの制御が素直で、
  **「電波のない会場で URL を開いて起動する」** という要件を確実に満たせる
- 台帳自身が派生として「**Vite + PWA + Cloudflare Workers｜オフライン必須の軽量アプリ**」を
  記録しており、この案件はまさにその型に当たる
- Tailwind v4 と shadcn/ui は Vite でもそのまま動く。**標準構成から外れるのはこの1点だけ**に留まる

## 結果
- 台帳の主流である Next.js 系のリポジトリから、ページ・レイアウトのコードを流用できない。
  ただし共有できるのは Tailwind の設定と shadcn/ui の部品であり、そこは維持される
- ホスティングは Cloudflare Workers ではなく **Vercel** に寄せ、台帳の主流から離れすぎないようにする
- 将来、閲覧ページを充実させる段階で Next.js を別アプリとして足す余地を残す
- **この判断は運営アプリにのみ適用される。** 他プロジェクトの標準構成は変更しない
