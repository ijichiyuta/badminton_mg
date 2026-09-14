// 速報の公開。ADR-0003：一方向・全量スナップショット。
//
// **大会データの正は端末内にある。** サーバにあるのは公開用の複製にすぎない。
// サーバが落ちても大会運営には影響しない。
//
// 同期は完全にバックグラウンドへ隔離する。
// **同期エラーのダイアログを試合中に出す実装は不可**（UX原則6 / N-2-3）。

import type { TournamentSnapshot } from './schema'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function isPublishConfigured(): boolean {
  return Boolean(URL && KEY)
}

// ---------------------------------------------------------------------------
// 公開範囲
// ---------------------------------------------------------------------------

export type NameVisibility = 'FULL' | 'FAMILY_ONLY' | 'AFFILIATION_ONLY'

export interface PublishOptions {
  /** 氏名の公開範囲（N-6-4）。未成年を含む大会では運営者が明示的に選ぶ。 */
  nameVisibility: NameVisibility
}

/**
 * 公開用にスナップショットを絞る。
 *
 * **生年月日・連絡先は常に除外する**（N-6-6）。
 * 操作ログも出さない。誰が何時に何を入力したかは公開する情報ではない。
 */
export function redact(snap: TournamentSnapshot, opts: PublishOptions): TournamentSnapshot {
  const players = snap.players.map((p) => {
    let name = p.name
    if (opts.nameVisibility === 'FAMILY_ONLY') {
      name = p.name.split(/[\s　]+/)[0] ?? p.name
    } else if (opts.nameVisibility === 'AFFILIATION_ONLY') {
      name = ''
    }
    // note や kana も落とす。公開に必要ない。
    return { id: p.id, tournamentId: p.tournamentId, name, affiliation: p.affiliation }
  })

  return {
    ...snap,
    players,
    // 更新用トークンをサーバへ送らない。
    tournament: { ...snap.tournament, publicToken: null },
    // 操作ログは公開しない。
    operations: [],
  }
}

// ---------------------------------------------------------------------------
// 更新用トークン
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'badminton-mg:publishToken:'

/**
 * 大会ごとの更新用トークン。
 *
 * **これを失っても大会運営には影響しない。** 速報の更新が止まるだけ（N-6-3）。
 * 端末内データにパスワードはかけない。
 */
export function publishToken(tournamentId: string): string {
  const k = TOKEN_KEY + tournamentId
  let t = localStorage.getItem(k)
  if (!t) {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    t = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(k, t)
  }
  return t
}

export function hasPublishToken(tournamentId: string): boolean {
  return localStorage.getItem(TOKEN_KEY + tournamentId) !== null
}

// ---------------------------------------------------------------------------
// 送信
// ---------------------------------------------------------------------------

export type SyncState =
  | { kind: 'OFF' }
  | { kind: 'SYNCED'; at: string }
  | { kind: 'PENDING'; count: number }
  | { kind: 'ERROR'; message: string; pending: number }

async function rpc(name: string, body: unknown): Promise<void> {
  if (!URL || !KEY) throw new Error('公開の設定がされていません')
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
  }
}

/**
 * スナップショットを公開する。
 *
 * 冪等。何度送っても結果は同じ。差分同期はしない（ADR-0003）。
 */
export async function publish(
  snap: TournamentSnapshot,
  opts: PublishOptions,
): Promise<void> {
  const token = publishToken(snap.tournament.id)
  await rpc('publish_tournament', {
    p_id: snap.tournament.id,
    p_name: snap.tournament.name,
    p_date: snap.tournament.date,
    p_venue: snap.tournament.venue,
    p_token: token,
    p_snapshot: redact(snap, opts),
  })
}

/** 公開を止める・再開する。 */
export async function setPublished(tournamentId: string, published: boolean): Promise<void> {
  await rpc('set_tournament_published', {
    p_id: tournamentId,
    p_token: publishToken(tournamentId),
    p_published: published,
  })
}

/** 公開ページの URL。QR にして会場に掲示する。 */
export function viewerUrl(tournamentId: string): string {
  const base = typeof location !== 'undefined' ? location.origin + location.pathname : ''
  return `${base}?view=${encodeURIComponent(tournamentId)}`
}

// ---------------------------------------------------------------------------
// 閲覧側
// ---------------------------------------------------------------------------

export async function fetchPublished(tournamentId: string): Promise<TournamentSnapshot | null> {
  if (!URL || !KEY) return null
  const res = await fetch(
    `${URL}/rest/v1/tournaments?id=eq.${encodeURIComponent(tournamentId)}&select=snapshot,updated_at`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as { snapshot: TournamentSnapshot; updated_at: string }[]
  if (rows.length === 0) return null
  return rows[0].snapshot
}

export async function fetchPublishedAt(tournamentId: string): Promise<string | null> {
  if (!URL || !KEY) return null
  const res = await fetch(
    `${URL}/rest/v1/tournaments?id=eq.${encodeURIComponent(tournamentId)}&select=updated_at`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as { updated_at: string }[]
  return rows[0]?.updated_at ?? null
}
