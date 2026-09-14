// ドメイン層の型定義。
// UI・永続化・通信に依存しない。docs/03-domain-model.md / docs/11-data-schema.md に対応する。

// ---------------------------------------------------------------------------
// 採点方式
// ---------------------------------------------------------------------------

/** 勝敗の決め方。TIME は時間制（スコアの高い方が勝ち）。 */
export type WinCondition = 'POINTS' | 'TIME'

/**
 * 採点方式。docs/06-scoring.md
 *
 * `maxPoints` は「その点を取った側が勝つ点数」と定義を固定する。
 * 21点制なら 30、15点制なら 17 や 21。null なら上限なし。
 */
export interface ScoringRuleSet {
  id: string
  presetId: string
  winCondition: WinCondition
  /** 1ゲームの基準点。TIME では null。 */
  pointsPerGame: number | null
  gamesPerMatch: number
  gamesToWin: number
  /** false = 「打切り」＝延長なし。基準点先取で決着する。 */
  twoPointLead: boolean
  /** 表示用。判定には使わない。 */
  deuceFrom: number | null
  /** この点を取った側が勝つ。null なら上限なし。 */
  maxPoints: number | null
  /** インターバルに入る点。null でインターバルなし。 */
  intervalAt: number | null
  /** winCondition === 'TIME' のときのみ。 */
  timeLimitMinutes: number | null
}

// ---------------------------------------------------------------------------
// 試合
// ---------------------------------------------------------------------------

/** 進行状態。時間とともに前へ進む。 */
export type MatchStatus =
  | 'PENDING'
  | 'READY'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'

/** 結果種別。status と直交する。docs/03-domain-model.md */
export type ResultType =
  | 'NORMAL'
  | 'BYE'
  | 'WALKOVER'
  | 'RETIRED'
  | 'WITHDRAWN'
  | 'DISQUALIFIED'
  | 'NOT_PLAYED'

export interface Game {
  scoreA: number
  scoreB: number
}

export interface Match {
  id: string
  eventId: string
  stageId: string
  groupId: string | null
  tieId: string | null
  /** 大会全体の通し試合番号。タイムテーブルとスコアシートで使う。 */
  number: number | null
  /** ブロック内の試合順。星取表に丸数字で入る。 */
  numberInGroup: number | null
  round: number
  slotInRound: number
  /** [A側, B側]。未確定の枠は null。 */
  entryIds: (string | null)[]
  status: MatchStatus
  resultType: ResultType
  games: Game[]
  winnerEntryId: string | null
  /** RETIRED / WITHDRAWN / DISQUALIFIED のとき、退いた側。 */
  retiredEntryId: string | null
  /** 適用された ScoringRuleSet の id。混在検知に使う。 */
  scoringRuleId: string | null
  courtId: string | null
  scheduledAt: string | null
  completedAt: string | null
  nextMatchId: string | null
  loserNextMatchId: string | null
}

// ---------------------------------------------------------------------------
// 順位決定
// ---------------------------------------------------------------------------

/** 判定指標。headToHead は持たない（docs/adr/0006）。 */
export type Criterion =
  | 'wins'
  | 'points'
  | 'matchRatio'
  | 'gameRatio'
  | 'pointRatio'
  | 'matchDiff'
  | 'gameDiff'
  | 'pointDiff'

/** 母集団スコープ。誰との対戦成績で比べるか。 */
export type TiebreakScope = 'AMONG_TIED' | 'ALL_MATCHES' | 'AMONG_TIED_IF_TWO'

export type UnresolvedAction = 'DRAW' | 'SHARED_RANK' | 'PLAYOFF'

export type WithdrawnHandling = 'BASE_POINT_TO_ZERO' | 'ZERO_ZERO' | 'EXCLUDE'

/** 順位決定ルール。docs/05-ranking-engine.md */
export interface RankingRuleSet {
  criteria: Criterion[]
  tiebreakScope: TiebreakScope
  unresolvedAction: UnresolvedAction
  pointsForWin: number
  pointsForLoss: number
  pointsForRetirement: number
  withdrawnHandling: WithdrawnHandling
  /** 棄権者の対戦を、相手の成績からも削除するか。 */
  removeFromOpponents: boolean
  /** 乱数シード。抽選の再現に使う。 */
  drawSeed: number | null
  presetId: string
}

/** 1エントリー分の集計値。 */
export interface EntryStats {
  entryId: string
  played: number
  wins: number
  losses: number
  points: number
  gamesWon: number
  gamesLost: number
  pointsWon: number
  pointsLost: number
}

/** 順位1件。reason は選手に見せるための説明文。 */
export interface RankedEntry {
  rank: number
  entryId: string
  stats: EntryStats
  reason: string
}

export interface RankingResult {
  entries: RankedEntry[]
  /** 当該者間の対戦が未消化なら true。「確定」と表示してはならない。 */
  provisional: boolean
  warnings: RankingWarning[]
}

export type RankingWarning =
  | { kind: 'MIXED_SCORING_RULE'; detail: string }
  | { kind: 'DRAW_USED'; detail: string }
  | { kind: 'SCOPE_CHANGES_RESULT'; detail: string }
  | { kind: 'UNEVEN_MATCH_COUNT'; detail: string }

// ---------------------------------------------------------------------------
// エントリー・組
// ---------------------------------------------------------------------------

export interface Player {
  id: string
  name: string
  kana?: string
  affiliation?: string
  region?: string
  grade?: string
  /**
   * 備考。名簿の取り込み元によっては**連絡先や住所が紛れ込みうる**。
   * 公開スナップショットでは必ず落とす（`store/publish.ts` の `redact`）。
   */
  note?: string
}

export type EntryStatus = 'ACTIVE' | 'WITHDRAWN' | 'SUBSTITUTED'

export interface Entry {
  id: string
  playerIds: string[]
  teamName?: string
  affiliation?: string
  seed: number | null
  status: EntryStatus
}

export interface Group {
  id: string
  name: string
  entryIds: string[]
  /** null なら Stage → Event → Tournament の順に継承。 */
  scoringRuleId: string | null
}
