// 採点方式・順位決定ルールのプリセット。docs/06-scoring.md / docs/05-ranking-engine.md
//
// 運営者に個別項目を設定させないための一覧。点数はここにしか現れない。
// ドメイン層の他のファイルに 15 / 17 / 21 / 30 を直接書いてはならない（docs/adr/0005）。

import type { RankingRuleSet, ScoringRuleSet } from './types'

export interface ScoringPreset extends ScoringRuleSet {
  label: string
  /** 既定で表示するか。false は「その他の形式」を開いたときだけ出す。 */
  common: boolean
  note: string
}

const sc = (p: Omit<ScoringPreset, 'id'>): ScoringPreset => ({ ...p, id: p.presetId })

/**
 * ゲーム形式プリセット。
 * 上限点は固定値にできない。第1号提供先では 17 / 21 / 延長なし が併存する
 * （docs/17-first-customer.md）。
 */
export const SCORING_PRESETS: ScoringPreset[] = [
  sc({
    presetId: '15pt-3g-cap21',
    label: '15点3ゲーム・最大21',
    winCondition: 'POINTS',
    pointsPerGame: 15,
    gamesPerMatch: 3,
    gamesToWin: 2,
    twoPointLead: true,
    deuceFrom: 14,
    maxPoints: 21,
    intervalAt: 8,
    timeLimitMinutes: null,
    common: true,
    note: '全国大会で使用。14オール延長2点差',
  }),
  sc({
    presetId: '15pt-3g-cap17',
    label: '15点3ゲーム・最大17',
    winCondition: 'POINTS',
    pointsPerGame: 15,
    gamesPerMatch: 3,
    gamesToWin: 2,
    twoPointLead: true,
    deuceFrom: 14,
    maxPoints: 17,
    intervalAt: 8,
    timeLimitMinutes: null,
    common: true,
    note: '時間制約のある地方大会。14オール延長2点差',
  }),
  sc({
    presetId: '15pt-3g-nodeuce',
    label: '15点3ゲーム・延長なし',
    winCondition: 'POINTS',
    pointsPerGame: 15,
    gamesPerMatch: 3,
    gamesToWin: 2,
    twoPointLead: false,
    deuceFrom: null,
    maxPoints: 15,
    intervalAt: 8,
    timeLimitMinutes: null,
    common: true,
    note: '要項の「打ち切り」。試合数の多いブロック向け',
  }),
  sc({
    presetId: '21pt-3g',
    label: '21点3ゲーム',
    winCondition: 'POINTS',
    pointsPerGame: 21,
    gamesPerMatch: 3,
    gamesToWin: 2,
    twoPointLead: true,
    deuceFrom: 20,
    maxPoints: 30,
    intervalAt: 11,
    timeLimitMinutes: null,
    common: true,
    note: '移行前の標準。20オール延長2点差',
  }),
  sc({
    presetId: '15pt-1g',
    label: '15点1ゲーム',
    winCondition: 'POINTS',
    pointsPerGame: 15,
    gamesPerMatch: 1,
    gamesToWin: 1,
    twoPointLead: true,
    deuceFrom: 14,
    maxPoints: 21,
    intervalAt: 8,
    timeLimitMinutes: null,
    common: true,
    note: '予選・時間短縮',
  }),
  sc({
    presetId: '21pt-1g',
    label: '21点1ゲーム',
    winCondition: 'POINTS',
    pointsPerGame: 21,
    gamesPerMatch: 1,
    gamesToWin: 1,
    twoPointLead: true,
    deuceFrom: 20,
    maxPoints: 30,
    intervalAt: 11,
    timeLimitMinutes: null,
    common: true,
    note: '予選・時間短縮',
  }),
  sc({
    presetId: '15pt-3g-nocap',
    label: '15点3ゲーム・上限なし',
    winCondition: 'POINTS',
    pointsPerGame: 15,
    gamesPerMatch: 3,
    gamesToWin: 2,
    twoPointLead: true,
    deuceFrom: 14,
    maxPoints: null,
    intervalAt: 8,
    timeLimitMinutes: null,
    common: false,
    note: '要項に上限の記載がない場合',
  }),
  sc({
    presetId: '21pt-3g-nocap',
    label: '21点3ゲーム・上限なし',
    winCondition: 'POINTS',
    pointsPerGame: 21,
    gamesPerMatch: 3,
    gamesToWin: 2,
    twoPointLead: true,
    deuceFrom: 20,
    maxPoints: null,
    intervalAt: 11,
    timeLimitMinutes: null,
    common: false,
    note: '要項に上限の記載がない場合',
  }),
  sc({
    presetId: '11pt-3g',
    label: '11点3ゲーム',
    winCondition: 'POINTS',
    pointsPerGame: 11,
    gamesPerMatch: 3,
    gamesToWin: 2,
    twoPointLead: true,
    deuceFrom: 10,
    maxPoints: 15,
    intervalAt: null,
    timeLimitMinutes: null,
    common: false,
    note: '短縮運用・低学年',
  }),
  sc({
    presetId: '11pt-1g',
    label: '11点1ゲーム',
    winCondition: 'POINTS',
    pointsPerGame: 11,
    gamesPerMatch: 1,
    gamesToWin: 1,
    twoPointLead: true,
    deuceFrom: 10,
    maxPoints: 15,
    intervalAt: null,
    timeLimitMinutes: null,
    common: false,
    note: '大人数の予選',
  }),
  sc({
    presetId: '9pt-1g',
    label: '9点1ゲーム',
    winCondition: 'POINTS',
    pointsPerGame: 9,
    gamesPerMatch: 1,
    gamesToWin: 1,
    twoPointLead: false,
    deuceFrom: null,
    maxPoints: 9,
    intervalAt: null,
    timeLimitMinutes: null,
    common: false,
    note: 'レクリエーション・ミニゲーム',
  }),
  sc({
    presetId: '7pt-1g',
    label: '7点1ゲーム',
    winCondition: 'POINTS',
    pointsPerGame: 7,
    gamesPerMatch: 1,
    gamesToWin: 1,
    twoPointLead: false,
    deuceFrom: null,
    maxPoints: 7,
    intervalAt: null,
    timeLimitMinutes: null,
    common: false,
    note: 'レクリエーション・ミニゲーム',
  }),
  sc({
    presetId: 'time-10min',
    label: '10分1本勝負',
    winCondition: 'TIME',
    pointsPerGame: null,
    gamesPerMatch: 1,
    gamesToWin: 1,
    twoPointLead: false,
    deuceFrom: null,
    maxPoints: null,
    intervalAt: null,
    timeLimitMinutes: 10,
    common: false,
    note: '時間制。スコアの高い方が勝ち',
  }),
  sc({
    presetId: 'time-7min',
    label: '7分1本勝負',
    winCondition: 'TIME',
    pointsPerGame: null,
    gamesPerMatch: 1,
    gamesToWin: 1,
    twoPointLead: false,
    deuceFrom: null,
    maxPoints: null,
    intervalAt: null,
    timeLimitMinutes: 7,
    common: false,
    note: '時間制。スコアの高い方が勝ち',
  }),
]

export const DEFAULT_SCORING_PRESET_ID = '15pt-3g-cap21'

export function findScoringPreset(presetId: string): ScoringPreset | undefined {
  return SCORING_PRESETS.find((p) => p.presetId === presetId)
}

export function defaultScoringRule(): ScoringRuleSet {
  const p = findScoringPreset(DEFAULT_SCORING_PRESET_ID)
  if (!p) throw new Error(`既定の採点プリセットが見つかりません: ${DEFAULT_SCORING_PRESET_ID}`)
  const { label: _l, common: _c, note: _n, ...rule } = p
  return rule
}

// ---------------------------------------------------------------------------
// ステージ構成プリセット
// ---------------------------------------------------------------------------

export interface StageScoringPreset {
  id: string
  label: string
  /** 予選ステージに当てる採点プリセット。 */
  qualifying: string
  /** 決勝ステージに当てる採点プリセット。 */
  final: string
}

/**
 * 「予選は1ゲーム、決勝は3ゲーム」はローカル大会で最も多い運用。
 * 採点方式を2回選ばせず、組み合わせ自体をプリセットにする。
 */
export const STAGE_SCORING_PRESETS: StageScoringPreset[] = [
  {
    id: 'uniform-15pt-3g',
    label: '全試合 15点3ゲーム',
    qualifying: '15pt-3g-cap21',
    final: '15pt-3g-cap21',
  },
  {
    id: 'qual1g-final3g-15pt',
    label: '予選1ゲーム → 決勝3ゲーム（15点）',
    qualifying: '15pt-1g',
    final: '15pt-3g-cap21',
  },
  {
    id: 'uniform-21pt-3g',
    label: '全試合 21点3ゲーム',
    qualifying: '21pt-3g',
    final: '21pt-3g',
  },
  {
    id: 'qual1g-final3g-21pt',
    label: '予選1ゲーム → 決勝3ゲーム（21点）',
    qualifying: '21pt-1g',
    final: '21pt-3g',
  },
  {
    id: 'qual11pt-final15pt',
    label: '予選11点3ゲーム → 決勝15点3ゲーム',
    qualifying: '11pt-3g',
    final: '15pt-3g-cap21',
  },
  {
    id: 'qualtime-final3g-15pt',
    label: '予選10分1本 → 決勝3ゲーム（15点）',
    qualifying: 'time-10min',
    final: '15pt-3g-cap21',
  },
]

// ---------------------------------------------------------------------------
// 順位決定ルールのプリセット
// ---------------------------------------------------------------------------

export interface RankingPreset extends RankingRuleSet {
  label: string
  /** 対応する要項の文面。運営者はこれを読んで選ぶ。 */
  wording: string
}

const baseRanking = {
  unresolvedAction: 'DRAW' as const,
  pointsForWin: 1,
  pointsForLoss: 0,
  pointsForRetirement: -1,
  withdrawnHandling: 'BASE_POINT_TO_ZERO' as const,
  removeFromOpponents: false,
  drawSeed: null,
}

export const RANKING_PRESETS: RankingPreset[] = [
  {
    ...baseRanking,
    presetId: 'wins-gameratio-pointdiff',
    label: '勝敗数 → ゲーム勝率 → 得失点差',
    wording:
      '勝敗数が同じ場合はゲーム勝率にて、ゲーム勝率が同じ場合は得失点差にて順位を決定します',
    criteria: ['wins', 'gameRatio', 'pointDiff'],
    tiebreakScope: 'ALL_MATCHES',
  },
  {
    ...baseRanking,
    presetId: 'standard-among-tied',
    label: '勝数 → 当該者間の成績 → ゲーム率 → ポイント率',
    wording: '勝数による。同数の場合は当該者間の成績による',
    criteria: ['wins', 'gameRatio', 'pointRatio'],
    tiebreakScope: 'AMONG_TIED',
  },
  {
    ...baseRanking,
    presetId: 'head-to-head-if-two',
    label: '2者は直接対決、3者以上はゲーム率',
    wording: '2者の場合は直接対決による。3者以上の場合はゲーム率による',
    criteria: ['wins', 'gameRatio', 'pointRatio'],
    tiebreakScope: 'AMONG_TIED_IF_TWO',
  },
  {
    ...baseRanking,
    presetId: 'diff-based',
    label: '勝数 → 得失ゲーム差 → 得失点差',
    wording: '得失ゲーム差による',
    criteria: ['wins', 'gameDiff', 'pointDiff'],
    tiebreakScope: 'ALL_MATCHES',
  },
  {
    ...baseRanking,
    presetId: 'team-league-aichi',
    label: '勝敗 → マッチ率 → ゲーム率 → ポイント率（決まらねば当事者同士）',
    wording:
      '勝敗による。以下、マッチ得失率・ゲーム得失率・ポイント得失率による。' +
      'これらで決まらない場合は当事者同士で勝った方を上位とする',
    // 団体戦リーグの標準形。愛知県社会人クラブリーグ 内規14 の文面そのまま。
    // マッチ率が入るのは「2複1単で1対戦=3マッチ」という団体戦の数え方があるため。
    criteria: ['matchRatio', 'gameRatio', 'pointRatio'],
    tiebreakScope: 'ALL_MATCHES',
    // 「上記で決まらない場合は当事者同士で勝った方」。最後の砦としてだけ当該者間を見る。
    unresolvedAction: 'HEAD_TO_HEAD',
  },
  {
    ...baseRanking,
    presetId: 'points-based',
    label: '勝点 → マッチ率 → ゲーム率',
    wording: '勝点（勝1・負0・棄権-1）による',
    criteria: ['points', 'matchRatio', 'gameRatio'],
    tiebreakScope: 'AMONG_TIED',
  },
]

/**
 * 既定は第1号提供先の要項に合わせる（docs/17-first-customer.md）。
 * 「勝敗数が同じ場合はゲーム勝率にて、ゲーム勝率が同じ場合は得失点差にて」
 */
export const DEFAULT_RANKING_PRESET_ID = 'wins-gameratio-pointdiff'

export function findRankingPreset(presetId: string): RankingPreset | undefined {
  return RANKING_PRESETS.find((p) => p.presetId === presetId)
}

export function defaultRankingRule(): RankingRuleSet {
  const p = findRankingPreset(DEFAULT_RANKING_PRESET_ID)
  if (!p) throw new Error(`既定の順位決定プリセットが見つかりません: ${DEFAULT_RANKING_PRESET_ID}`)
  const { label: _l, wording: _w, ...rule } = p
  return rule
}
