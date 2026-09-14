// 順位決定ルールエンジン。本システムの中核。docs/05-ranking-engine.md / docs/adr/0006
//
// 判定は「指標（criteria）」と「母集団スコープ（tiebreakScope）」の2軸に分解する。
// headToHead は指標として持たない。2者の直接対決は AMONG_TIED で criteria[0] を
// 評価した結果として自動的に得られる。
//
// 外部依存を持たない純粋関数。入力は成績データとルールセット、出力は順位と根拠のみ。

import { countsTowardRatios, hasWinner, isDoubleWalkover } from './scoring'
import type {
  Criterion,
  EntryStats,
  Match,
  RankedEntry,
  RankingResult,
  RankingRuleSet,
  RankingWarning,
  ScoringRuleSet,
  TiebreakScope,
} from './types'

// ---------------------------------------------------------------------------
// 乱数（抽選の再現に使う）
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

export interface RankingContext {
  /** 対象エントリー。 */
  entryIds: string[]
  /** 対象となりうる全試合。 */
  matches: Match[]
  rule: RankingRuleSet
  /** Match.scoringRuleId から採点方式を引く。棄権を「基準点-0」で記録する際に必要。 */
  scoringRules?: Record<string, ScoringRuleSet>
  /** 団体戦の Tie 単位で数える場合に渡す。 */
  isTeamEvent?: boolean
}

function emptyStats(entryId: string): EntryStats {
  return {
    entryId,
    played: 0,
    wins: 0,
    losses: 0,
    matchesWon: 0,
    matchesLost: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    pointsWon: 0,
    pointsLost: 0,
  }
}

/** 棄権・欠場をどう記録するかに従って、1試合分のゲームを組み立てる。 */
function gamesFor(
  match: Match,
  rule: RankingRuleSet,
  scoring: ScoringRuleSet | undefined,
): { scoreA: number; scoreB: number }[] | null {
  // 両者とも現れなかった場合。どちらにも「0 - 基準点」を付ける。
  // 勝者がいないので 21-0 の向きを決められず、0-0 でも済ませられない
  // （公表集計では双方にポイント0-126 が付いている）。呼び出し側で個別に処理する。
  if (match.resultType === 'DOUBLE_WALKOVER') return []

  if (match.resultType === 'WITHDRAWN' || match.resultType === 'WALKOVER') {
    if (rule.withdrawnHandling === 'EXCLUDE') return null
    if (rule.withdrawnHandling === 'ZERO_ZERO') return []
    // BASE_POINT_TO_ZERO: 基準点-0 を gamesToWin 分。21-0 ではない（docs/05）。
    const base = scoring?.pointsPerGame
    if (base === null || base === undefined) return []
    const n = scoring?.gamesToWin ?? 1
    const winnerIsA = match.winnerEntryId !== null && match.entryIds[0] === match.winnerEntryId
    return Array.from({ length: n }, () =>
      winnerIsA ? { scoreA: base, scoreB: 0 } : { scoreA: 0, scoreB: base },
    )
  }
  return match.games
}

/**
 * 対象エントリーの成績を集計する。
 *
 * `amongOnly` が true のとき、両者が対象集合に含まれる試合だけを数える（当該者間）。
 */
export function aggregate(ctx: RankingContext, target: string[], amongOnly: boolean): EntryStats[] {
  const set = new Set(target)
  const stats = new Map<string, EntryStats>()
  for (const id of target) stats.set(id, emptyStats(id))

  // 対戦（Tie）単位の勝敗。団体戦では「勝敗」がこちらの単位になる。
  // 個人戦でも同じ器を使い、1マッチ=1Tie として扱う。
  const ties = new Map<string, { won: Map<string, number>; retired: Set<string>; bothLose?: boolean }>()
  const tally = (m: Match, winner: string, loser: string | null) => {
    // tieId がない試合は、その試合自体を1つの Tie とみなす。
    const key = m.tieId ?? m.id
    let t = ties.get(key)
    if (!t) {
      t = { won: new Map(), retired: new Set() }
      ties.set(key, t)
    }
    t.won.set(winner, (t.won.get(winner) ?? 0) + 1)
    if (loser !== null && !t.won.has(loser)) t.won.set(loser, 0)
    // 棄権は勝点の扱いが違う。対戦のうち1つでも棄権があればその側に適用する。
    if (isRetirement(m) && m.retiredEntryId) t.retired.add(m.retiredEntryId)
  }
  // 両者とも現れなかった対戦。勝者なしで両方に負けを付ける。
  const loseBoth = (m: Match, a: string, b: string) => {
    const key = m.tieId ?? m.id
    let t = ties.get(key)
    if (!t) {
      t = { won: new Map(), retired: new Set() }
      ties.set(key, t)
    }
    for (const id of [a, b]) {
      if (!t.won.has(id)) t.won.set(id, 0)
      t.retired.add(id)
    }
    t.bothLose = true
  }

  // 棄権者との対戦を相手の成績からも削除する設定。
  const removed = new Set<string>()
  if (ctx.rule.removeFromOpponents) {
    for (const m of ctx.matches) {
      if (m.resultType === 'WITHDRAWN' || m.resultType === 'DISQUALIFIED') {
        if (m.retiredEntryId) removed.add(m.retiredEntryId)
      }
    }
  }

  for (const m of ctx.matches) {
    const [a, b] = m.entryIds

    // 不戦勝は相手が存在しない。勝者の1勝として数えるが、
    // ゲーム率・ポイント率の分母には入れない（docs/05 / 暫定決定 P-07）。
    // 相手がいないため「当該者間」の集計には現れない。
    if (m.resultType === 'BYE') {
      if (amongOnly) continue
      if (!hasWinner(m) || m.winnerEntryId === null) continue
      const s = stats.get(m.winnerEntryId)
      if (s) s.matchesWon++
      tally(m, m.winnerEntryId, null)
      continue
    }

    if (a === null || b === null) continue
    if (removed.has(a) || removed.has(b)) continue

    const aIn = set.has(a)
    const bIn = set.has(b)
    if (amongOnly ? !(aIn && bIn) : !(aIn || bIn)) continue

    const sA = stats.get(a)
    const sB = stats.get(b)

    // 両者とも現れなかった対戦。双方の負けとして数える。
    if (isDoubleWalkover(m)) {
      const scoringD = m.scoringRuleId ? ctx.scoringRules?.[m.scoringRuleId] : undefined
      const base = scoringD?.pointsPerGame ?? 0
      const n = scoringD?.gamesToWin ?? 1
      for (const s of [sA, sB]) {
        if (!s) continue
        s.matchesLost++
        if (ctx.rule.withdrawnHandling === 'EXCLUDE') continue
        s.played++
        if (ctx.rule.withdrawnHandling === 'BASE_POINT_TO_ZERO') {
          s.gamesLost += n
          s.pointsLost += base * n
        }
      }
      loseBoth(m, a, b)
      continue
    }

    if (!hasWinner(m)) continue

    // 勝敗は BYE でも数える（不戦勝は1勝）。
    if (m.winnerEntryId === a) {
      if (sA) sA.matchesWon++
      if (sB) sB.matchesLost++
      tally(m, a, b)
    } else if (m.winnerEntryId === b) {
      if (sB) sB.matchesWon++
      if (sA) sA.matchesLost++
      tally(m, b, a)
    }

    if (!countsTowardRatios(m)) continue

    const scoring = m.scoringRuleId ? ctx.scoringRules?.[m.scoringRuleId] : undefined
    const games = gamesFor(m, ctx.rule, scoring)
    if (games === null) continue

    if (sA) sA.played++
    if (sB) sB.played++

    for (const g of games) {
      if (sA) {
        sA.pointsWon += g.scoreA
        sA.pointsLost += g.scoreB
      }
      if (sB) {
        sB.pointsWon += g.scoreB
        sB.pointsLost += g.scoreA
      }
      if (g.scoreA > g.scoreB) {
        if (sA) sA.gamesWon++
        if (sB) sB.gamesLost++
      } else if (g.scoreB > g.scoreA) {
        if (sB) sB.gamesWon++
        if (sA) sA.gamesLost++
      }
    }
  }

  // Tie 単位の勝敗を確定させる。勝ちマッチ数が多い側がその対戦の勝ち。
  // 同数なら引き分けとして、どちらの勝敗にも数えない（要項に定めがないため勝手に決めない）。
  for (const t of ties.values()) {
    const entries = [...t.won.entries()]
    if (entries.length === 0) continue
    if (t.bothLose) {
      for (const [id] of entries) {
        const s = stats.get(id)
        if (!s) continue
        s.losses++
        s.points += ctx.rule.pointsForRetirement
      }
      continue
    }
    const best = Math.max(...entries.map(([, n]) => n))
    const winners = entries.filter(([, n]) => n === best)
    if (winners.length !== 1) continue
    for (const [id, n] of entries) {
      const s = stats.get(id)
      if (!s) continue
      if (n === best) {
        s.wins++
        s.points += ctx.rule.pointsForWin
      } else {
        s.losses++
        s.points += t.retired.has(id) ? ctx.rule.pointsForRetirement : ctx.rule.pointsForLoss
      }
    }
  }

  return target.map((id) => stats.get(id) ?? emptyStats(id))
}

function isRetirement(m: Match): boolean {
  return (
    m.resultType === 'RETIRED' || m.resultType === 'WITHDRAWN' || m.resultType === 'DISQUALIFIED'
  )
}

// ---------------------------------------------------------------------------
// 指標
// ---------------------------------------------------------------------------

const METRIC_LABEL: Record<Criterion, string> = {
  wins: '勝数',
  points: '勝点',
  matchRatio: '取得マッチ率',
  gameRatio: '取得ゲーム率',
  pointRatio: '取得ポイント率',
  matchDiff: '得失マッチ差',
  gameDiff: '得失ゲーム差',
  pointDiff: '得失点差',
}

function metricValue(s: EntryStats, c: Criterion): number | null {
  switch (c) {
    case 'wins':
      return s.wins
    case 'points':
      return s.points
    case 'matchRatio': {
      const d = s.matchesWon + s.matchesLost
      return d === 0 ? null : s.matchesWon / d
    }
    case 'gameRatio': {
      const d = s.gamesWon + s.gamesLost
      return d === 0 ? null : s.gamesWon / d
    }
    case 'pointRatio': {
      const d = s.pointsWon + s.pointsLost
      return d === 0 ? null : s.pointsWon / d
    }
    case 'matchDiff':
      return s.matchesWon - s.matchesLost
    case 'gameDiff':
      return s.gamesWon - s.gamesLost
    case 'pointDiff':
      return s.pointsWon - s.pointsLost
  }
}

function formatMetric(c: Criterion, v: number): string {
  switch (c) {
    case 'gameRatio':
    case 'pointRatio':
    case 'matchRatio':
      return v.toFixed(3)
    case 'gameDiff':
    case 'pointDiff':
    case 'matchDiff':
      return v > 0 ? `+${v}` : `${v}`
    default:
      return `${v}`
  }
}

/** 同値ごとにまとめる。降順。 */
function groupByMetric(
  stats: EntryStats[],
  c: Criterion,
): { value: number; members: EntryStats[] }[] | null {
  const withValue: { s: EntryStats; v: number }[] = []
  for (const s of stats) {
    const v = metricValue(s, c)
    if (v === null) return null // 分母が0。この指標は計算不能。
    withValue.push({ s, v })
  }
  const byValue = new Map<number, EntryStats[]>()
  for (const { s, v } of withValue) {
    const arr = byValue.get(v)
    if (arr) arr.push(s)
    else byValue.set(v, [s])
  }
  return [...byValue.entries()]
    .sort((x, y) => y[0] - x[0])
    .map(([value, members]) => ({ value, members }))
}

function effectiveScope(scope: TiebreakScope, tiedCount: number): 'AMONG_TIED' | 'ALL_MATCHES' {
  if (scope === 'ALL_MATCHES') return 'ALL_MATCHES'
  if (scope === 'AMONG_TIED') return 'AMONG_TIED'
  return tiedCount === 2 ? 'AMONG_TIED' : 'ALL_MATCHES'
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

export interface RankOptions {
  /**
   * AMONG_TIED と ALL_MATCHES で順位が変わるかを検査し、
   * 変わる場合に警告を出す。要項に規定がないときの判断材料になる。
   */
  detectScopeSensitivity?: boolean
}

export function rank(ctx: RankingContext, opts: RankOptions = {}): RankingResult {
  const result = rankInternal(ctx)

  if (opts.detectScopeSensitivity && ctx.rule.tiebreakScope !== 'AMONG_TIED') {
    const alt = rankInternal({ ...ctx, rule: { ...ctx.rule, tiebreakScope: 'AMONG_TIED' } })
    if (!sameOrder(result.entries, alt.entries)) {
      result.warnings.push({
        kind: 'SCOPE_CHANGES_RESULT',
        detail:
          '当該者間で再計算すると順位が変わります。要項に規定がない場合、どちらを採るか確認してください',
      })
    }
  }

  return result
}

function sameOrder(a: RankedEntry[], b: RankedEntry[]): boolean {
  if (a.length !== b.length) return false
  return a.every((e, i) => e.entryId === b[i].entryId && e.rank === b[i].rank)
}

function rankInternal(ctx: RankingContext): RankingResult {
  const warnings: RankingWarning[] = []
  const overall = new Map(aggregate(ctx, ctx.entryIds, false).map((s) => [s.entryId, s]))

  // 採点方式の混在検知。ブロック内の混在は集計を壊す（不変条件7）。
  const ruleIds = new Set(
    ctx.matches
      .filter((m) => m.scoringRuleId !== null && involvesAny(m, ctx.entryIds))
      .map((m) => m.scoringRuleId as string),
  )
  if (ruleIds.size > 1) {
    warnings.push({
      kind: 'MIXED_SCORING_RULE',
      detail: `このブロック内に ${ruleIds.size} 種類の採点方式が混在しています。集計が不公平になります`,
    })
  }

  // 試合数の偏り。ブロックのチーム数が違う場合の横断比較に効く。
  const playedCounts = new Set([...overall.values()].map((s) => s.played))
  if (playedCounts.size > 1) {
    warnings.push({
      kind: 'UNEVEN_MATCH_COUNT',
      detail: '実施試合数が揃っていません。勝数での比較は不公平になることがあります',
    })
  }

  const rng = mulberry32(ctx.rule.drawSeed ?? 0)
  const drawUsed = { flag: false }

  const first = ctx.rule.criteria[0]
  const base = ctx.entryIds.map((id) => overall.get(id) ?? emptyStats(id))
  const groups = groupByMetric(base, first) ?? [{ value: 0, members: base }]

  const out: RankedEntry[] = []
  let cursor = 1
  for (const g of groups) {
    if (g.members.length === 1) {
      out.push(fixed(g.members[0], cursor, overall, recordText(g.members[0])))
    } else {
      out.push(
        ...resolve(
          ctx,
          g.members.map((s) => s.entryId),
          cursor,
          overall,
          rng,
          drawUsed,
          0,
        ),
      )
    }
    cursor += g.members.length
  }

  if (drawUsed.flag) {
    warnings.push({
      kind: 'DRAW_USED',
      detail: `すべての基準で決着しなかったため抽選を行いました（シード ${ctx.rule.drawSeed ?? 0}）`,
    })
  }

  return { entries: out, provisional: isProvisional(ctx), warnings }
}

function involvesAny(m: Match, ids: string[]): boolean {
  return m.entryIds.some((e) => e !== null && ids.includes(e))
}

/** リーグ途中なら true。「確定」と表示してはならない。 */
function isProvisional(ctx: RankingContext): boolean {
  const set = new Set(ctx.entryIds)
  return ctx.matches.some((m) => {
    const [a, b] = m.entryIds
    if (a === null || b === null) return true
    if (!set.has(a) || !set.has(b)) return false
    return m.status !== 'COMPLETED'
  })
}

function recordText(s: EntryStats): string {
  return `${s.wins}勝${s.losses}敗`
}

function fixed(
  s: EntryStats,
  rank: number,
  overall: Map<string, EntryStats>,
  reason: string,
): RankedEntry {
  return { rank, entryId: s.entryId, stats: overall.get(s.entryId) ?? s, reason }
}

/**
 * 同率の解決。
 *
 * スコープを切り替えたうえで **criteria[0] から** 再評価する。
 * index 1 から始めると「当該者間の勝敗による」という要項の標準文面を取りこぼす（docs/adr/0006）。
 */
function resolve(
  ctx: RankingContext,
  tied: string[],
  startRank: number,
  overall: Map<string, EntryStats>,
  rng: () => number,
  drawUsed: { flag: boolean },
  depth: number,
): RankedEntry[] {
  if (depth > ctx.entryIds.length) return unresolved(ctx, tied, startRank, overall, rng, drawUsed)

  const scope = effectiveScope(ctx.rule.tiebreakScope, tied.length)
  const subset = aggregate(ctx, tied, scope === 'AMONG_TIED')
  const scopeLabel =
    scope === 'AMONG_TIED' ? `当該${tied.length}者間で再集計し` : '全試合の成績で比較し'

  for (let i = 0; i < ctx.rule.criteria.length; i++) {
    const c = ctx.rule.criteria[i]
    const split = groupByMetric(subset, c)
    if (split === null) continue // 分母が0。0除算しない。
    if (split.length < 2) continue // 分割できなかった。次の指標へ。

    const out: RankedEntry[] = []
    let cursor = startRank
    for (const [gi, g] of split.entries()) {
      if (g.members.length === 1) {
        const s = g.members[0]
        const full = overall.get(s.entryId) ?? s
        // **順位に応じて言い方を変える。** 最下位に「上回りました」と書いてはならない。
        // 3集団以上に分かれたときの中ほどは「上回った」とも「下回った」とも言えない。
        const verb =
          gi === 0 ? '上回りました' : gi === split.length - 1 ? '下回りました' : '中位でした'
        // 中位の集団は「上回った」とも「下回った」とも言えないので値だけを述べる。
        // そのときも文として終わらせる（値で切ると読み手が途中だと思う）。
        const tail = `${METRIC_LABEL[c]} ${formatMetric(c, g.value)} で${verb}`
        // 「いたのため」「だったのため」にならないよう、活用形はここで閉じる。
        const reason = `${recordText(full)}。${tiedLabel(tied.length)}ため${scopeLabel}、${tail}`
        out.push(fixed(s, cursor, overall, reason))
      } else {
        out.push(
          ...resolve(
            ctx,
            g.members.map((s) => s.entryId),
            cursor,
            overall,
            rng,
            drawUsed,
            depth + 1,
          ),
        )
      }
      cursor += g.members.length
    }
    return out
  }

  return unresolved(ctx, tied, startRank, overall, rng, drawUsed)
}

/**
 * 同率だった人数の言い方。後ろに「ため」が続く形で返す。
 *
 * 「1者と並んだ」は日本語として不自然なので2者だけ別の言い方にする。
 */
function tiedLabel(n: number): string {
  return n === 2 ? '同率の相手がいた' : `${n}者が同率だった`
}

function unresolved(
  ctx: RankingContext,
  tied: string[],
  startRank: number,
  overall: Map<string, EntryStats>,
  rng: () => number,
  drawUsed: { flag: boolean },
): RankedEntry[] {
  const action = ctx.rule.unresolvedAction

  const sharedRank = (ids: string[], rank: number, why: string): RankedEntry[] =>
    ids.map((id) => {
      const s = overall.get(id) ?? emptyStats(id)
      return { rank, entryId: id, stats: s, reason: `${recordText(s)}。${why}` }
    })

  if (action === 'SHARED_RANK') {
    return sharedRank(tied, startRank, 'すべての基準で並んだため同順位としました')
  }

  // 「上記◯〜◯で決まらない場合は当事者同士で勝った方」。
  // criteria を全部使い切ってから、最後にだけ当該者間の勝敗を見る。
  // ここでも決まらなければ同順位にする。要項がそれ以上を定めていないため、
  // 勝手に乱数で並べ替えると運営が説明できなくなる。
  if (action === 'HEAD_TO_HEAD') {
    const subset = aggregate(ctx, tied, true)
    const split = groupByMetric(subset, 'wins')
    if (split !== null && split.length >= 2) {
      const out: RankedEntry[] = []
      let cursor = startRank
      for (const [gi, g] of split.entries()) {
        if (g.members.length === 1) {
          const s = g.members[0]
          const full = overall.get(s.entryId) ?? s
          const verb = gi === 0 ? '勝っていた' : gi === split.length - 1 ? '負けていた' : 'でした'
          const reason =
            `${recordText(full)}。すべての基準で並んだため、` +
            `当事者同士の対戦で比べ、${g.value}勝で${verb}ためこの順位です`
          out.push(fixed(s, cursor, overall, reason))
        } else {
          out.push(
            ...sharedRank(
              g.members.map((s) => s.entryId),
              cursor,
              '当事者同士の対戦でも並んだため同順位としました',
            ),
          )
        }
        cursor += g.members.length
      }
      return out
    }
    return sharedRank(tied, startRank, '当事者同士の対戦でも決まらなかったため同順位としました')
  }

  if (action === 'PLAYOFF') {
    return tied.map((id) => {
      const s = overall.get(id) ?? emptyStats(id)
      return {
        rank: startRank,
        entryId: id,
        stats: s,
        reason: `${recordText(s)}。すべての基準で並んだため順位決定戦が必要です`,
      }
    })
  }

  // DRAW: 乱数で並べる。シードを記録しているので再現できる。
  drawUsed.flag = true
  const shuffled = [...tied]
    .map((id) => ({ id, r: rng() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.id)

  return shuffled.map((id, i) => {
    const s = overall.get(id) ?? emptyStats(id)
    return {
      rank: startRank + i,
      entryId: id,
      stats: s,
      reason: `${recordText(s)}。すべての基準で並んだため抽選で決定しました`,
    }
  })
}
