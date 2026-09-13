// Dexie(IndexedDB) のインスタンスと基本操作。
//
// ADR-0001：端末内のデータが正。通信が存在しなくても全機能が動く。
// N-1-1：すべての操作を即時永続化する。明示的な保存ボタンに依存しない。

import Dexie, { type Table } from 'dexie'
import type {
  BackupRecord,
  EntryRecord,
  EventRecord,
  GroupRecord,
  MatchRecord,
  OperationRecord,
  PlayerRecord,
  RankingRuleRecord,
  ScoringRuleRecord,
  StageRecord,
  TournamentRecord,
  TournamentSnapshot,
} from './schema'
import { SCHEMA_VERSION } from './schema'

export class BadmintonDb extends Dexie {
  tournaments!: Table<TournamentRecord, string>
  events!: Table<EventRecord, string>
  stages!: Table<StageRecord, string>
  groups!: Table<GroupRecord, string>
  entries!: Table<EntryRecord, string>
  players!: Table<PlayerRecord, string>
  matches!: Table<MatchRecord, string>
  scoringRules!: Table<ScoringRuleRecord, string>
  rankingRules!: Table<RankingRuleRecord, string>
  operations!: Table<OperationRecord, string>
  backups!: Table<BackupRecord, string>

  constructor(name = 'badminton-mg') {
    super(name)
    this.version(SCHEMA_VERSION).stores({
      tournaments: 'id, date, updatedAt',
      events: 'id, tournamentId, order',
      stages: 'id, tournamentId, eventId, order',
      groups: 'id, tournamentId, eventId, stageId, order',
      entries: 'id, tournamentId, eventId, status',
      players: 'id, tournamentId, name',
      // number は通し試合番号。紙からの転記で最もよく引く。
      matches: 'id, tournamentId, eventId, stageId, groupId, number, status, courtId',
      scoringRules: 'id, tournamentId',
      rankingRules: 'id, tournamentId',
      operations: 'id, tournamentId, seq, undone',
      backups: 'id, tournamentId, seq',
    })
  }
}

let instance: BadmintonDb | null = null

export function db(): BadmintonDb {
  if (instance === null) instance = new BadmintonDb()
  return instance
}

/** テスト用。名前を変えた新しいDBに差し替える。 */
export function useDb(next: BadmintonDb): void {
  instance = next
}

// ---------------------------------------------------------------------------
// スナップショット
// ---------------------------------------------------------------------------

/** 大会データの全量を1つの JSON にまとめる。エクスポートと同期の両方で使う。 */
export async function snapshot(
  tournamentId: string,
  d: BadmintonDb = db(),
): Promise<TournamentSnapshot> {
  const tournament = await d.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`大会が見つかりません: ${tournamentId}`)

  const where = { tournamentId }
  const [events, stages, groups, entries, players, matches, scoringRules, rankingRules, operations] =
    await Promise.all([
      d.events.where(where).toArray(),
      d.stages.where(where).toArray(),
      d.groups.where(where).toArray(),
      d.entries.where(where).toArray(),
      d.players.where(where).toArray(),
      d.matches.where(where).toArray(),
      d.scoringRules.where(where).toArray(),
      d.rankingRules.where(where).toArray(),
      d.operations.where(where).toArray(),
    ])

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tournament,
    events: events.sort((a, b) => a.order - b.order),
    stages: stages.sort((a, b) => a.order - b.order),
    groups: groups.sort((a, b) => a.order - b.order),
    entries,
    players,
    matches: matches.sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    scoringRules,
    rankingRules,
    operations: operations.sort((a, b) => a.seq - b.seq),
  }
}

export interface RestoreResult {
  tournamentId: string
  warnings: string[]
}

/**
 * スナップショットを取り込む。
 *
 * `schemaVersion` が未知でも**読み込みを拒否せず、警告を出して可能な範囲で読む**（UX原則5）。
 * 大会当日に「バージョンが違うので開けません」は最悪の失敗になる。
 */
export async function restore(
  snap: TournamentSnapshot,
  d: BadmintonDb = db(),
): Promise<RestoreResult> {
  const warnings: string[] = []
  if (snap.schemaVersion !== SCHEMA_VERSION) {
    warnings.push(
      `データのバージョンが ${snap.schemaVersion} です（このアプリは ${SCHEMA_VERSION}）。読める範囲で取り込みました`,
    )
  }
  if (!snap.tournament?.id) throw new Error('大会データが壊れています（idがありません）')

  const id = snap.tournament.id
  await d.transaction(
    'rw',
    [
      d.tournaments,
      d.events,
      d.stages,
      d.groups,
      d.entries,
      d.players,
      d.matches,
      d.scoringRules,
      d.rankingRules,
      d.operations,
    ],
    async () => {
      await clearTournament(id, d)
      await d.tournaments.put({ ...snap.tournament, schemaVersion: SCHEMA_VERSION })
      await d.events.bulkPut(snap.events ?? [])
      await d.stages.bulkPut(snap.stages ?? [])
      await d.groups.bulkPut(snap.groups ?? [])
      await d.entries.bulkPut(snap.entries ?? [])
      await d.players.bulkPut(snap.players ?? [])
      await d.matches.bulkPut(snap.matches ?? [])
      await d.scoringRules.bulkPut(snap.scoringRules ?? [])
      await d.rankingRules.bulkPut(snap.rankingRules ?? [])
      await d.operations.bulkPut(snap.operations ?? [])
    },
  )

  return { tournamentId: id, warnings }
}

async function clearTournament(tournamentId: string, d: BadmintonDb): Promise<void> {
  const where = { tournamentId }
  await Promise.all([
    d.events.where(where).delete(),
    d.stages.where(where).delete(),
    d.groups.where(where).delete(),
    d.entries.where(where).delete(),
    d.players.where(where).delete(),
    d.matches.where(where).delete(),
    d.scoringRules.where(where).delete(),
    d.rankingRules.where(where).delete(),
    d.operations.where(where).delete(),
  ])
}

/** 大会を削除する。破壊的操作なので、呼び出し側で必ず確認を取る。 */
export async function deleteTournament(tournamentId: string, d: BadmintonDb = db()): Promise<void> {
  await clearTournament(tournamentId, d)
  await d.backups.where({ tournamentId }).delete()
  await d.tournaments.delete(tournamentId)
}

// ---------------------------------------------------------------------------
// バックアップ
// ---------------------------------------------------------------------------

/** 保持する世代数。 */
export const BACKUP_GENERATIONS = 20

/**
 * 世代バックアップを取る。
 *
 * 運営者に意識させない（O-5-4）。定期実行の呼び出し側がこれを叩くだけ。
 */
export async function takeBackup(
  tournamentId: string,
  kind: 'AUTO' | 'MANUAL' = 'AUTO',
  d: BadmintonDb = db(),
): Promise<BackupRecord> {
  const snap = await snapshot(tournamentId, d)
  const json = JSON.stringify(snap)

  // 同じミリ秒に2回取ると時刻では区別できない。連番で順序を決める。
  const existing = await d.backups.where({ tournamentId }).toArray()
  const seq = existing.reduce((mx, b) => Math.max(mx, b.seq), 0) + 1

  const rec: BackupRecord = {
    id: `bk-${tournamentId}-${seq}`,
    tournamentId,
    seq,
    at: new Date().toISOString(),
    snapshot: json,
    kind,
    sizeBytes: json.length,
  }
  await d.backups.put(rec)

  // 直近 N 世代だけ残す。
  const stale = [...existing, rec].sort((a, b) => b.seq - a.seq).slice(BACKUP_GENERATIONS)
  if (stale.length > 0) await d.backups.bulkDelete(stale.map((b) => b.id))

  return rec
}

/** バックアップから復元する。「JSONを開く」と同じ1操作で済ませる（F-11-6）。 */
export async function restoreBackup(backupId: string, d: BadmintonDb = db()): Promise<RestoreResult> {
  const bk = await d.backups.get(backupId)
  if (!bk) throw new Error(`バックアップが見つかりません: ${backupId}`)
  return restore(JSON.parse(bk.snapshot) as TournamentSnapshot, d)
}

export async function listBackups(
  tournamentId: string,
  d: BadmintonDb = db(),
): Promise<BackupRecord[]> {
  const all = await d.backups.where({ tournamentId }).toArray()
  // 新しい順。連番で並べるので同じミリ秒でも安定する。
  return all.sort((a, b) => b.seq - a.seq)
}
