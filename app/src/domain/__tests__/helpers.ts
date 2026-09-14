import { judgeMatch } from '../scoring'
import { defaultRankingRule, findScoringPreset } from '../presets'
import type { Match, RankingRuleSet, ResultType, ScoringRuleSet } from '../types'

export function scoringRule(presetId: string): ScoringRuleSet {
  const p = findScoringPreset(presetId)
  if (!p) throw new Error(`unknown preset: ${presetId}`)
  const { label: _l, common: _c, note: _n, ...rule } = p
  return rule
}

export const RULE_15_CAP21 = scoringRule('15pt-3g-cap21')
export const RULE_15_CAP17 = scoringRule('15pt-3g-cap17')
export const RULE_15_NODEUCE = scoringRule('15pt-3g-nodeuce')
export const RULE_21 = scoringRule('21pt-3g')

export const SCORING_RULES: Record<string, ScoringRuleSet> = {
  [RULE_15_CAP21.id]: RULE_15_CAP21,
  [RULE_15_CAP17.id]: RULE_15_CAP17,
  [RULE_15_NODEUCE.id]: RULE_15_NODEUCE,
  [RULE_21.id]: RULE_21,
}

let seq = 0

export interface MkOptions {
  resultType?: ResultType
  retiredEntryId?: string | null
  scoringRuleId?: string
  winnerEntryId?: string | null
  status?: Match['status']
  tieId?: string | null
  lineupSlot?: string | null
}

/** テスト用の Match を作る。勝者はスコアから自動判定する。 */
export function mk(
  a: string | null,
  b: string | null,
  games: [number, number][],
  opts: MkOptions = {},
): Match {
  const scoringRuleId = opts.scoringRuleId ?? RULE_15_CAP21.id
  const rule = SCORING_RULES[scoringRuleId]
  const gs = games.map(([scoreA, scoreB]) => ({ scoreA, scoreB }))
  let winnerEntryId: string | null = null
  if (opts.winnerEntryId !== undefined) {
    winnerEntryId = opts.winnerEntryId
  } else if (gs.length > 0) {
    const j = judgeMatch(gs, rule)
    winnerEntryId = j.winner === 'A' ? a : j.winner === 'B' ? b : null
  }
  return {
    id: `m${++seq}`,
    eventId: 'e1',
    stageId: 's1',
    groupId: 'g1',
    tieId: opts.tieId ?? null,
    lineupSlot: opts.lineupSlot ?? null,
    number: seq,
    numberInGroup: seq,
    round: 1,
    slotInRound: 1,
    entryIds: [a, b],
    status: opts.status ?? 'COMPLETED',
    resultType: opts.resultType ?? 'NORMAL',
    games: gs,
    winnerEntryId,
    retiredEntryId: opts.retiredEntryId ?? null,
    scoringRuleId,
    courtId: null,
    scheduledAt: null,
    completedAt: null,
    nextMatchId: null,
    loserNextMatchId: null,
  }
}

export function ranking(over: Partial<RankingRuleSet> = {}): RankingRuleSet {
  return { ...defaultRankingRule(), ...over }
}

/** 順位順のエントリーID。 */
export function order(entries: { entryId: string }[]): string[] {
  return entries.map((e) => e.entryId)
}

/** 順位番号の配列。 */
export function ranks(entries: { rank: number }[]): number[] {
  return entries.map((e) => e.rank)
}
