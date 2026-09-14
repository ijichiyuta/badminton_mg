// 永続化のスキーマ。docs/11-data-schema.md（schemaVersion 2）
//
// 端末内のデータが正（ADR-0001）。サーバはバックアップと閲覧ページ配信のみ。
// すべての操作を即時永続化する。明示的な保存ボタンに依存しない（N-1-1）。

import type {
  Entry,
  Group,
  Match,
  Player,
  RankingRuleSet,
  ScoringRuleSet,
} from '../domain/types'

export const SCHEMA_VERSION = 2

export type StageType = 'SINGLE_ELIMINATION' | 'ROUND_ROBIN' | 'CONSOLATION' | 'PLAYOFF'

export interface Court {
  id: string
  name: string
}

export interface TournamentRecord {
  id: string
  name: string
  date: string
  venue: string
  organizer: string
  courts: Court[]
  /** 大会の既定値。Event → Stage → Group の順に上書きされる。 */
  defaultScoringRuleId: string
  defaultRankingRulePresetId: string
  /** ステージ構成プリセット。 */
  stageScoringPresetId: string
  /** 公開ページの更新用トークン。端末内データは暗号化しない（N-6-1）。 */
  publicToken: string | null
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface EventRecord {
  id: string
  tournamentId: string
  name: string
  discipline: 'MS' | 'WS' | 'MD' | 'WD' | 'XD' | 'TEAM'
  category: string
  entryType: 'INDIVIDUAL' | 'PAIR' | 'TEAM'
  /**
   * 団体戦のオーダー構成 id（`TEAM_LINEUP_PRESETS`）。個人戦では null。
   * 1対戦を何試合に分けるかがここで決まる。
   */
  teamLineupId?: string | null
  /** null なら大会の既定値を継承。 */
  scoringRuleId: string | null
  rankingRulePresetId: string | null
  order: number
}

export interface StageRecord {
  id: string
  tournamentId: string
  eventId: string
  order: number
  name: string
  type: StageType
  /** null なら Event → Tournament の順に継承。 */
  scoringRuleId: string | null
  /** 団体戦の打ち切り。Tie ではなく Stage が持つ（暫定決定 P-22）。 */
  truncate: boolean
  options: {
    bracketSize?: number
    /** トーナメントの抽選シード。記録しておかないと同じドローを再現できない。 */
    drawSeed?: number
    thirdPlaceMatch?: boolean
    carryOverResults?: boolean
    carryOverScope?: 'MATCH_RESULT_ONLY' | 'FULL_STATS'
    allowPartialAdvancement?: boolean
  }
}

export interface GroupRecord extends Group {
  tournamentId: string
  eventId: string
  stageId: string
  order: number
}

export interface EntryRecord extends Entry {
  tournamentId: string
  eventId: string
}

export interface PlayerRecord extends Player {
  tournamentId: string
}

export interface MatchRecord extends Match {
  tournamentId: string
}

/** ユーザー定義を含む採点方式の実体。プリセットもここに複製して保存する。 */
export interface ScoringRuleRecord extends ScoringRuleSet {
  tournamentId: string
}

export interface RankingRuleRecord extends RankingRuleSet {
  id: string
  tournamentId: string
}

// ---------------------------------------------------------------------------
// 操作ログ（Undo の土台）
// ---------------------------------------------------------------------------

export type OperationType =
  | 'MATCH_RESULT_ENTERED'
  | 'MATCH_RESULT_CLEARED'
  | 'DRAW_EXECUTED'
  | 'ENTRY_WITHDRAWN'
  | 'ENTRY_SUBSTITUTED'
  | 'SCHEDULE_BUILT'
  | 'RANKING_OVERRIDDEN'

/**
 * 1操作分の記録。
 *
 * 逆操作ではなく**変更前後のレコードをそのまま持つ**。
 * 大会1つ分のデータが数百KBに収まるため、素朴に持ったほうが安全で戻しやすい。
 * 確認ダイアログではなくこれで守る（UX原則3）。
 */
export interface OperationRecord {
  id: string
  tournamentId: string
  /**
   * 大会内で単調増加する連番。
   *
   * **時刻で並べてはならない。** 連続入力モードでは複数の操作が同じミリ秒に入り、
   * 時刻だけでは順序が決まらず Undo が別の試合を戻す。
   */
  seq: number
  at: string
  type: OperationType
  /** 人間が読む説明。トーストにそのまま出す。 */
  label: string
  /** 変更されたテーブルと、変更前のレコード（undo 用）。 */
  before: OperationPatch[]
  /** 変更後のレコード（redo 用）。 */
  after: OperationPatch[]
  undoable: boolean
  /** 取り消し済みか。 */
  undone: boolean
}

export interface OperationPatch {
  table: 'matches' | 'entries' | 'groups' | 'stages' | 'events' | 'tournaments'
  key: string
  /** null は「そのレコードが存在しなかった」ことを表す。 */
  value: unknown | null
}

// ---------------------------------------------------------------------------
// バックアップ
// ---------------------------------------------------------------------------

export interface BackupRecord {
  id: string
  tournamentId: string
  /** 大会内で単調増加する連番。時刻だけでは同じミリ秒の2件を区別できない。 */
  seq: number
  at: string
  /** 大会データの全量スナップショット（JSON文字列）。 */
  snapshot: string
  /** 自動か手動か。 */
  kind: 'AUTO' | 'MANUAL'
  sizeBytes: number
}

// ---------------------------------------------------------------------------
// エクスポート形式
// ---------------------------------------------------------------------------

/** JSON エクスポート／インポートと、速報のスナップショットで使う形。 */
export interface TournamentSnapshot {
  schemaVersion: number
  exportedAt: string
  tournament: TournamentRecord
  events: EventRecord[]
  stages: StageRecord[]
  groups: GroupRecord[]
  entries: EntryRecord[]
  players: PlayerRecord[]
  matches: MatchRecord[]
  scoringRules: ScoringRuleRecord[]
  rankingRules: RankingRuleRecord[]
  operations: OperationRecord[]
}
