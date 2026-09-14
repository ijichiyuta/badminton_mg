// ファイルへの自動保存。docs/08-non-functional-requirements.md N-1
//
// ブラウザの保存領域は「サイトデータを消去」やシークレットモードで飛ぶ。
// Windowsアプリのファイルは消そうとしない限り消えない。**ここが構造的な弱点だった。**
//
// File System Access API を使うと、実際のファイルに直接書き込める。
// これで旧サービスと同等の「PCのファイルに保存」になる。
//
// 対応：Windows / Mac の Chrome・Edge。Safari と Firefox は非対応。
// 非対応の環境では定期的な自動ダウンロードにフォールバックする。

import type { TournamentSnapshot } from './schema'

// File System Access API の最小限の型。TS の標準には入っていない環境がある。
interface FileHandle {
  createWritable(): Promise<{
    write(data: string): Promise<void>
    close(): Promise<void>
  }>
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  name: string
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

type WindowWithFS = Window & {
  showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileHandle>
  showOpenFilePicker?: (opts?: unknown) => Promise<FileHandle[]>
}

export function isFileSaveSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithFS).showSaveFilePicker === 'function'
}

// ---------------------------------------------------------------------------
// 保存先の記憶
// ---------------------------------------------------------------------------

let handle: FileHandle | null = null
let lastWrittenAt: string | null = null
let lastError: string | null = null

export interface FileSaveStatus {
  supported: boolean
  /** 保存先が選ばれているか。 */
  linked: boolean
  fileName: string | null
  lastWrittenAt: string | null
  lastError: string | null
}

export function fileSaveStatus(): FileSaveStatus {
  return {
    supported: isFileSaveSupported(),
    linked: handle !== null,
    fileName: handle?.name ?? null,
    lastWrittenAt,
    lastError,
  }
}

/**
 * 保存先のファイルを選んでもらう。
 * **1回だけ**。以降は同じファイルへ黙って上書きする。
 */
export async function linkFile(suggestedName: string): Promise<boolean> {
  const w = window as WindowWithFS
  if (!w.showSaveFilePicker) return false
  try {
    handle = await w.showSaveFilePicker({
      suggestedName,
      types: [{ description: '大会データ', accept: { 'application/json': ['.json'] } }],
    })
    lastError = null
    return true
  } catch {
    // ユーザーがキャンセルした。エラーではない。
    return false
  }
}

export function unlinkFile(): void {
  handle = null
  lastWrittenAt = null
}

/**
 * スナップショットをファイルへ書く。
 *
 * **失敗しても画面を止めない**（N-2-3）。状態だけ更新して呼び出し側に返す。
 */
export async function writeSnapshot(snap: TournamentSnapshot): Promise<boolean> {
  if (!handle) return false
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      const asked = await handle.requestPermission({ mode: 'readwrite' })
      if (asked !== 'granted') {
        lastError = 'ファイルへの書き込みが許可されていません'
        return false
      }
    }
    const w = await handle.createWritable()
    await w.write(JSON.stringify(snap, null, 2))
    await w.close()
    lastWrittenAt = new Date().toISOString()
    lastError = null
    return true
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    return false
  }
}

// ---------------------------------------------------------------------------
// フォールバック：ダウンロード
// ---------------------------------------------------------------------------

/** File System Access API が使えない環境向け。ダウンロードフォルダへ書き出す。 */
export function downloadSnapshot(snap: TournamentSnapshot, fileName: string): void {
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// ブラウザに「消さないで」と申請する
// ---------------------------------------------------------------------------

/**
 * 永続ストレージを要求する。
 *
 * 手動の「サイトデータを消去」は防げないが、
 * 容量不足による自動削除からは守られる。1行で済むので必ず呼ぶ。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  try {
    const e = await navigator.storage.estimate()
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
  } catch {
    return null
  }
}

/** 保存ファイル名。大会名と日付から作る。 */
export function suggestedFileName(tournamentName: string, date: string): string {
  const safe = tournamentName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
  return `${date}_${safe}.json`
}
