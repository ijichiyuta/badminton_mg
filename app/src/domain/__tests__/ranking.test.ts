// 順位決定エンジンのテスト。docs/05-ranking-engine.md の T-01〜T-22 / T-25。
// 実装より先に書く。現場で最も揉める箇所であり、バグは信用を直接損なう。

import { describe, expect, it } from 'vitest'
import { aggregate, rank } from '../ranking'
import type { RankingContext } from '../ranking'
import {
  RULE_15_CAP17,
  RULE_15_CAP21,
  RULE_21,
  SCORING_RULES,
  mk,
  order,
  ranking,
  ranks,
} from './helpers'
import type { Match, RankingRuleSet } from '../types'

function ctx(entryIds: string[], matches: Match[], rule: RankingRuleSet): RankingContext {
  return { entryIds, matches, rule, scoringRules: SCORING_RULES }
}

const AMONG = { tiebreakScope: 'AMONG_TIED' as const, criteria: ['wins', 'gameRatio', 'pointRatio'] as const }

// ---------------------------------------------------------------------------

describe('T-01 3名リーグ、criteria[0] のみで確定', () => {
  const ms = [
    mk('A', 'B', [[15, 9], [15, 11]]),
    mk('A', 'C', [[15, 5], [15, 7]]),
    mk('B', 'C', [[15, 12], [15, 9]]),
  ]
  it('勝数だけで順位が決まる', () => {
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking()))
    expect(order(r.entries)).toEqual(['A', 'B', 'C'])
    expect(ranks(r.entries)).toEqual([1, 2, 3])
  })
  it('根拠に勝敗が出る', () => {
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking()))
    expect(r.entries[0].reason).toBe('2勝0敗')
  })
  it('全試合完了なら暫定ではない', () => {
    expect(rank(ctx(['A', 'B', 'C'], ms, ranking())).provisional).toBe(false)
  })
})

describe('T-02 3名全員1勝1敗。当該者間の勝数で割れずゲーム率へ', () => {
  const ms = [
    mk('A', 'B', [[15, 9], [15, 9]]),
    mk('B', 'C', [[15, 9], [9, 15], [15, 9]]),
    mk('C', 'A', [[15, 9], [15, 9]]),
  ]
  it('当該3者間のゲーム率で決まる', () => {
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria] })))
    expect(order(r.entries)).toEqual(['C', 'A', 'B'])
  })
  it('根拠に再集計したことが書かれる', () => {
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria] })))
    expect(r.entries[0].reason).toContain('当該3者間で再集計し')
    expect(r.entries[0].reason).toContain('取得ゲーム率')
  })
})

describe('T-03 ゲーム率も同一。ポイント率で決まる', () => {
  const ms = [
    mk('A', 'B', [[15, 0], [0, 15], [15, 0]]),
    mk('B', 'C', [[15, 5], [5, 15], [15, 5]]),
    mk('C', 'A', [[15, 10], [10, 15], [15, 10]]),
  ]
  it('全員ゲーム率0.5でポイント率が効く', () => {
    const stats = aggregate(ctx(['A', 'B', 'C'], ms, ranking()), ['A', 'B', 'C'], true)
    for (const s of stats) expect(s.gamesWon / (s.gamesWon + s.gamesLost)).toBeCloseTo(0.5)
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria] })))
    expect(order(r.entries)).toEqual(['A', 'C', 'B'])
    expect(r.entries[0].reason).toContain('取得ポイント率')
  })
})

describe('T-04 すべての指標が同一。抽選に到達しシードが記録される', () => {
  const ms = [
    mk('A', 'B', [[15, 0], [15, 0]]),
    mk('B', 'C', [[15, 0], [15, 0]]),
    mk('C', 'A', [[15, 0], [15, 0]]),
  ]
  it('抽選で決まり、警告が出る', () => {
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria], drawSeed: 42 })))
    expect(r.entries).toHaveLength(3)
    expect(ranks(r.entries)).toEqual([1, 2, 3])
    expect(r.warnings.some((w) => w.kind === 'DRAW_USED')).toBe(true)
    expect(r.entries[0].reason).toContain('抽選')
  })
  it('同じシードなら結果が再現する', () => {
    const run = () =>
      order(rank(ctx(['A', 'B', 'C'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria], drawSeed: 42 }))).entries)
    expect(run()).toEqual(run())
  })
  it('シードが違えば並びが変わりうる', () => {
    const run = (seed: number) =>
      order(rank(ctx(['A', 'B', 'C'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria], drawSeed: seed }))).entries)
    const seen = new Set([run(1), run(2), run(3), run(7), run(11)].map((x) => x.join()))
    expect(seen.size).toBeGreaterThan(1)
  })
})

// T-05 の対戦表：A-B:B / A-C:A / A-D:A / B-C:B / B-D:D / C-D:C
// A と B がともに2勝1敗で並ぶ。全試合のゲーム率では A が上、直接対決では B が上。
const T05: Match[] = [
  mk('A', 'B', [[15, 9], [9, 15], [9, 15]]), // B
  mk('A', 'C', [[15, 5], [15, 7]]), // A
  mk('A', 'D', [[15, 6], [15, 8]]), // A
  mk('B', 'C', [[15, 9], [9, 15], [15, 11]]), // B
  mk('B', 'D', [[9, 15], [11, 15]]), // D
  mk('C', 'D', [[15, 10], [15, 12]]), // C
]

describe('T-05 2名同率は当該者間の勝数（＝直接対決）で決まる', () => {
  it('AMONG_TIED では直接対決に勝った B が上', () => {
    const r = rank(ctx(['A', 'B', 'C', 'D'], T05, ranking({ ...AMONG, criteria: [...AMONG.criteria] })))
    expect(order(r.entries).slice(0, 2)).toEqual(['B', 'A'])
  })
  it('headToHead という指標を使わずに実現されている', () => {
    const rule = ranking({ ...AMONG, criteria: [...AMONG.criteria] })
    expect(rule.criteria).not.toContain('headToHead')
  })
})

describe('T-15 / T-21 ALL_MATCHES では当該者間の再集計を行わない', () => {
  it('既定ルールでは全試合のゲーム率で決まり、直接対決の敗者 A が上に来る', () => {
    const r = rank(ctx(['A', 'B', 'C', 'D'], T05, ranking()))
    expect(order(r.entries).slice(0, 2)).toEqual(['A', 'B'])
    expect(r.entries[0].reason).toContain('全試合の成績で比較し')
  })
  it('既定ルールは第1号提供先の要項どおり', () => {
    const rule = ranking()
    expect(rule.criteria).toEqual(['wins', 'gameRatio', 'pointDiff'])
    expect(rule.tiebreakScope).toBe('ALL_MATCHES')
  })
})

describe('T-22 スコープで順位が変わることを検知する', () => {
  it('SCOPE_CHANGES_RESULT の警告が出る', () => {
    const r = rank(ctx(['A', 'B', 'C', 'D'], T05, ranking()), { detectScopeSensitivity: true })
    expect(r.warnings.some((w) => w.kind === 'SCOPE_CHANGES_RESULT')).toBe(true)
  })
  it('順位が変わらないデータでは警告を出さない', () => {
    const ms = [
      mk('A', 'B', [[15, 9], [15, 9]]),
      mk('A', 'C', [[15, 9], [15, 9]]),
      mk('B', 'C', [[15, 9], [15, 9]]),
    ]
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking()), { detectScopeSensitivity: true })
    expect(r.warnings.some((w) => w.kind === 'SCOPE_CHANGES_RESULT')).toBe(false)
  })
})

// T-06：5名。A/B/C が2勝2敗で並び、当該3者間は全員1勝1敗。
const T06: Match[] = [
  mk('A', 'B', [[15, 9], [15, 9]]),
  mk('B', 'C', [[15, 9], [9, 15], [15, 9]]),
  mk('C', 'A', [[15, 9], [15, 9]]),
  mk('D', 'A', [[15, 9], [15, 9]]),
  mk('D', 'B', [[15, 9], [15, 9]]),
  mk('D', 'C', [[15, 9], [15, 9]]),
  mk('A', 'E', [[15, 9], [15, 9]]),
  mk('B', 'E', [[15, 9], [15, 9]]),
  mk('C', 'E', [[15, 9], [15, 9]]),
  mk('D', 'E', [[15, 9], [15, 9]]),
]

describe('T-06 当該者間で勝数が割れないとき次の指標へ進む', () => {
  it('D が1位、E が5位、中間3名は当該者間のゲーム率で決まる', () => {
    const r = rank(ctx(['A', 'B', 'C', 'D', 'E'], T06, ranking({ ...AMONG, criteria: [...AMONG.criteria] })))
    expect(order(r.entries)[0]).toBe('D')
    expect(order(r.entries)[4]).toBe('E')
    expect(order(r.entries).slice(1, 4)).toEqual(['C', 'A', 'B'])
  })
})

describe('T-16 AMONG_TIED_IF_TWO は3者以上で全試合成績に落ちる', () => {
  const ids = ['A', 'B', 'C', 'D', 'E']
  const ifTwo = () =>
    rank(ctx(ids, T06, ranking({ tiebreakScope: 'AMONG_TIED_IF_TWO', criteria: [...AMONG.criteria] })))

  it('3者同率では当該者間の再集計を行わない', () => {
    const r = ifTwo()
    const mid = r.entries.filter((e) => ['A', 'B', 'C'].includes(e.entryId))
    for (const e of mid) expect(e.reason).toContain('全試合の成績で比較し')
  })
  it('2者同率なら当該者間（＝直接対決）で決まる', () => {
    const r = rank(
      ctx(['A', 'B', 'C', 'D'], T05, ranking({ tiebreakScope: 'AMONG_TIED_IF_TWO', criteria: [...AMONG.criteria] })),
    )
    expect(order(r.entries).slice(0, 2)).toEqual(['B', 'A'])
    expect(r.entries[0].reason).toContain('当該2者間で再集計し')
  })
})

// T-07 / T-08：6名。A/B/C/D が2勝3敗で並び、当該4者間の勝数で 2+2 に分割される。
const T0708: Match[] = [
  mk('B', 'A', [[15, 9], [15, 9]]),
  mk('A', 'C', [[15, 9], [15, 9]]),
  mk('A', 'D', [[15, 9], [15, 9]]),
  mk('E', 'A', [[15, 9], [15, 9]]),
  mk('F', 'A', [[15, 9], [15, 9]]),
  mk('B', 'C', [[15, 9], [15, 9]]),
  mk('D', 'B', [[15, 9], [15, 9]]),
  mk('E', 'B', [[15, 9], [15, 9]]),
  mk('F', 'B', [[15, 9], [15, 9]]),
  mk('C', 'D', [[15, 9], [15, 9]]),
  mk('C', 'E', [[15, 9], [15, 9]]),
  mk('F', 'C', [[15, 9], [15, 9]]),
  mk('E', 'D', [[15, 9], [15, 9]]),
  mk('D', 'F', [[15, 9], [15, 9]]),
  mk('E', 'F', [[15, 9], [15, 9]]),
]

describe('T-07 当該者間の criteria[0] で分割できる', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F']
  it('4名同率が当該者間の勝数で 2+2 に分かれる', () => {
    const sub = aggregate(ctx(ids, T0708, ranking()), ['A', 'B', 'C', 'D'], true)
    const wins = Object.fromEntries(sub.map((s) => [s.entryId, s.wins]))
    expect(wins).toEqual({ A: 2, B: 2, C: 1, D: 1 })
  })
  it('index 1 からではなく 0 から再評価するため勝数で割れる', () => {
    const r = rank(ctx(ids, T0708, ranking({ ...AMONG, criteria: [...AMONG.criteria] })))
    expect(order(r.entries).slice(0, 2)).toEqual(['E', 'F'])
    expect(order(r.entries).slice(2, 4).sort()).toEqual(['A', 'B'])
    expect(order(r.entries).slice(4, 6).sort()).toEqual(['C', 'D'])
  })
})

describe('T-08 分割後のグループを再帰的に解決する', () => {
  it('2名グループはその2名間の成績で決まる', () => {
    const r = rank(ctx(['A', 'B', 'C', 'D', 'E', 'F'], T0708, ranking({ ...AMONG, criteria: [...AMONG.criteria] })))
    expect(order(r.entries)).toEqual(['E', 'F', 'B', 'A', 'C', 'D'])
    expect(ranks(r.entries)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

// T-09 / T-10：C が棄権した4名リーグ。
const withdrawnMatches = (): Match[] => [
  mk('A', 'B', [[15, 9], [15, 9]]),
  mk('D', 'A', [[15, 9], [9, 15], [15, 9]]),
  mk('B', 'D', [[15, 9], [15, 9]]),
  mk('C', 'A', [[15, 9], [15, 9]]),
  mk('B', 'C', [], { resultType: 'WITHDRAWN', retiredEntryId: 'C', winnerEntryId: 'B' }),
  mk('D', 'C', [], { resultType: 'WITHDRAWN', retiredEntryId: 'C', winnerEntryId: 'D' }),
]

describe('T-09 棄権者の成績を残す設定', () => {
  it('棄権者に勝った側の勝利が残る', () => {
    const ms = withdrawnMatches()
    const r = rank(ctx(['A', 'B', 'C', 'D'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria], removeFromOpponents: false })))
    const byId = Object.fromEntries(r.entries.map((e) => [e.entryId, e.stats.wins]))
    expect(byId.B).toBe(2)
    expect(byId.D).toBe(2)
  })
})

describe('T-10 棄権者との対戦を相手の成績からも削除する設定', () => {
  it('順位が変わる', () => {
    const keep = order(
      rank(ctx(['A', 'B', 'C', 'D'], withdrawnMatches(), ranking({ ...AMONG, criteria: [...AMONG.criteria], removeFromOpponents: false })))
        .entries,
    )
    const drop = order(
      rank(ctx(['A', 'B', 'C', 'D'], withdrawnMatches(), ranking({ ...AMONG, criteria: [...AMONG.criteria], removeFromOpponents: true })))
        .entries,
    )
    expect(keep).not.toEqual(drop)
  })
  it('削除すると棄権者に勝った側の勝利が消える', () => {
    const r = rank(
      ctx(['A', 'B', 'C', 'D'], withdrawnMatches(), ranking({ ...AMONG, criteria: [...AMONG.criteria], removeFromOpponents: true })),
    )
    const byId = Object.fromEntries(r.entries.map((e) => [e.entryId, e.stats.wins]))
    expect(byId.B).toBe(1)
    expect(byId.D).toBe(1)
  })
})

describe('T-11 分母が0の指標をスキップし、0除算しない', () => {
  it('当該者間の対戦が全て除外されてもクラッシュしない', () => {
    const ms = [
      mk('A', 'B', [], { resultType: 'WITHDRAWN', retiredEntryId: 'B', winnerEntryId: 'A' }),
      mk('B', 'C', [], { resultType: 'WITHDRAWN', retiredEntryId: 'B', winnerEntryId: 'C' }),
      mk('C', 'A', [], { resultType: 'WITHDRAWN', retiredEntryId: 'A', winnerEntryId: 'C' }),
    ]
    const r = rank(
      ctx(['A', 'B', 'C'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria], withdrawnHandling: 'EXCLUDE', drawSeed: 1 })),
    )
    expect(r.entries).toHaveLength(3)
    for (const e of r.entries) expect(Number.isFinite(e.rank)).toBe(true)
  })
})

describe('T-12 打ち切られた試合はゲーム率の分母に入らない', () => {
  it('NOT_PLAYED は played にも games にも数えない', () => {
    const ms = [
      mk('A', 'B', [[15, 9], [15, 9]]),
      mk('A', 'C', [], { resultType: 'NOT_PLAYED', winnerEntryId: null }),
    ]
    const [a] = aggregate(ctx(['A', 'B', 'C'], ms, ranking()), ['A'], false)
    expect(a.played).toBe(1)
    expect(a.gamesWon + a.gamesLost).toBe(2)
  })
})

describe('T-13 マッチ率が同率でゲーム率で決まる', () => {
  it('勝点・マッチ率が並び、ゲーム率が効く', () => {
    const ms = [
      mk('A', 'B', [[15, 9], [15, 9]]),
      mk('B', 'C', [[15, 9], [9, 15], [15, 9]]),
      mk('C', 'A', [[15, 9], [15, 9]]),
    ]
    const r = rank(
      ctx(['A', 'B', 'C'], ms, ranking({ tiebreakScope: 'AMONG_TIED', criteria: ['points', 'matchRatio', 'gameRatio'] })),
    )
    expect(order(r.entries)).toEqual(['C', 'A', 'B'])
    expect(r.entries[0].reason).toContain('取得ゲーム率')
  })
})

describe('T-14 「率」と「差」で順位が入れ替わる', () => {
  // C は不戦勝（BYE）で1勝。BYE はゲーム率の分母に入らない（P-07）。
  const ms = [
    mk('A', 'X', [[15, 9], [15, 9]]), // A 勝ち。ゲーム 2W0L
    mk('A', 'Y', [[15, 9], [9, 15], [15, 9]]), // A 勝ち。ゲーム 2W1L
    mk('A', 'C', [[15, 9], [9, 15], [11, 15]]), // C 勝ち。A 1W2L / C 2W1L
    mk('C', null, [], { resultType: 'BYE', winnerEntryId: 'C' }),
  ]
  it('勝数では並ぶ', () => {
    const st = aggregate(ctx(['A', 'C'], ms, ranking()), ['A', 'C'], false)
    const byId = Object.fromEntries(st.map((s) => [s.entryId, s]))
    expect(byId.A.wins).toBe(2)
    expect(byId.C.wins).toBe(2)
    // BYE はゲーム率の分母に入らない
    expect(byId.C.gamesWon + byId.C.gamesLost).toBe(3)
    expect(byId.A.gamesWon + byId.A.gamesLost).toBe(8)
  })
  it('A は 5勝3敗（率 .625 / 差 +2）、C は 2勝1敗（率 .667 / 差 +1）', () => {
    const st = aggregate(ctx(['A', 'C'], ms, ranking()), ['A', 'C'], false)
    const byId = Object.fromEntries(st.map((s) => [s.entryId, s]))
    expect([byId.A.gamesWon, byId.A.gamesLost]).toEqual([5, 3])
    expect([byId.C.gamesWon, byId.C.gamesLost]).toEqual([2, 1])
  })
  it('ゲーム率なら C が上、得失ゲーム差なら A が上', () => {
    const byRatio = order(
      rank(ctx(['A', 'C'], ms, ranking({ criteria: ['wins', 'gameRatio'], tiebreakScope: 'ALL_MATCHES' }))).entries,
    )
    const byDiff = order(
      rank(ctx(['A', 'C'], ms, ranking({ criteria: ['wins', 'gameDiff'], tiebreakScope: 'ALL_MATCHES' }))).entries,
    )
    expect(byRatio).toEqual(['C', 'A'])
    expect(byDiff).toEqual(['A', 'C'])
  })
})

describe('T-17 SHARED_RANK は同順位にして人数分繰り下げる', () => {
  const ms = [
    mk('A', 'B', [[15, 0], [15, 0]]),
    mk('B', 'C', [[15, 0], [15, 0]]),
    mk('C', 'A', [[15, 0], [15, 0]]),
    mk('A', 'D', [[15, 0], [15, 0]]),
    mk('B', 'D', [[15, 0], [15, 0]]),
    mk('C', 'D', [[15, 0], [15, 0]]),
  ]
  it('1位・1位・1位、次は4位', () => {
    const r = rank(
      ctx(['A', 'B', 'C', 'D'], ms, ranking({ ...AMONG, criteria: [...AMONG.criteria], unresolvedAction: 'SHARED_RANK' })),
    )
    expect(ranks(r.entries)).toEqual([1, 1, 1, 4])
    expect(r.entries[0].reason).toContain('同順位')
  })
})

describe('T-18 リーグ途中は暫定として返す', () => {
  it('未完了の試合があれば provisional', () => {
    const ms = [
      mk('A', 'B', [[15, 9], [15, 9]]),
      mk('A', 'C', [], { status: 'SCHEDULED', winnerEntryId: null }),
      mk('B', 'C', [], { status: 'READY', winnerEntryId: null }),
    ]
    expect(rank(ctx(['A', 'B', 'C'], ms, ranking())).provisional).toBe(true)
  })
})

describe('T-19 棄権は「基準点-0」で記録する。21-0 ではない', () => {
  const wd = (scoringRuleId: string) => [
    mk('A', 'B', [], { resultType: 'WITHDRAWN', retiredEntryId: 'B', winnerEntryId: 'A', scoringRuleId }),
  ]
  it('15点制なら 15-0 が2ゲーム分', () => {
    const [a] = aggregate(ctx(['A', 'B'], wd(RULE_15_CAP21.id), ranking()), ['A'], false)
    expect(a.pointsWon).toBe(15 * RULE_15_CAP21.gamesToWin)
    expect(a.pointsLost).toBe(0)
  })
  it('21点制なら 21-0 が2ゲーム分。設定に追従する', () => {
    const [a] = aggregate(ctx(['A', 'B'], wd(RULE_21.id), ranking()), ['A'], false)
    expect(a.pointsWon).toBe(21 * RULE_21.gamesToWin)
  })
  it('ZERO_ZERO 設定ならポイントを数えない', () => {
    const [a] = aggregate(
      ctx(['A', 'B'], wd(RULE_15_CAP21.id), ranking({ withdrawnHandling: 'ZERO_ZERO' })),
      ['A'],
      false,
    )
    expect(a.pointsWon).toBe(0)
  })
})

describe('T-20 同一ブロック内の採点方式の混在を検知する', () => {
  it('MIXED_SCORING_RULE の警告が出る', () => {
    const ms = [
      mk('A', 'B', [[15, 9], [15, 9]], { scoringRuleId: RULE_15_CAP21.id }),
      mk('A', 'C', [[16, 14], [15, 9]], { scoringRuleId: RULE_15_CAP17.id }),
      mk('B', 'C', [[15, 9], [15, 9]], { scoringRuleId: RULE_15_CAP21.id }),
    ]
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking()))
    expect(r.warnings.some((w) => w.kind === 'MIXED_SCORING_RULE')).toBe(true)
  })
  it('単一なら警告を出さない', () => {
    const ms = [mk('A', 'B', [[15, 9], [15, 9]]), mk('A', 'C', [[15, 9], [15, 9]]), mk('B', 'C', [[15, 9], [15, 9]])]
    expect(rank(ctx(['A', 'B', 'C'], ms, ranking())).warnings.some((w) => w.kind === 'MIXED_SCORING_RULE')).toBe(false)
  })
})

describe('T-25 試合数が揃わない横断比較に警告を出す', () => {
  it('UNEVEN_MATCH_COUNT の警告が出る', () => {
    const ms = [
      mk('A', 'B', [[15, 9], [15, 9]]),
      mk('A', 'C', [[15, 9], [15, 9]]),
      mk('B', 'C', [], { resultType: 'NOT_PLAYED', winnerEntryId: null }),
    ]
    const r = rank(ctx(['A', 'B', 'C'], ms, ranking()))
    expect(r.warnings.some((w) => w.kind === 'UNEVEN_MATCH_COUNT')).toBe(true)
  })
})

describe('停止性', () => {
  it('全員が完全に同一でも無限ループしない', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F']
    const ms: Match[] = []
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        ms.push(mk(ids[i], ids[j], [[15, 0], [15, 0]]))
      }
    }
    const r = rank(ctx(ids, ms, ranking({ ...AMONG, criteria: [...AMONG.criteria], drawSeed: 3 })))
    expect(r.entries).toHaveLength(6)
  })
})

describe('まだ試合が行われていないとき', () => {
  const rule = ranking({ criteria: ['wins', 'gameRatio', 'pointDiff'], unresolvedAction: 'DRAW' })

  it('**抽選に落とさない。**行われていない抽選の結果を表示しない', () => {
    const r = rank({ entryIds: ['A', 'B', 'C', 'D'], matches: [], rule })
    expect(r.warnings.some((w) => w.kind === 'DRAW_USED')).toBe(false)
    for (const e of r.entries) expect(e.reason).toBe('まだ試合が行われていません')
  })

  it('全員が同順位になる', () => {
    const r = rank({ entryIds: ['A', 'B', 'C', 'D'], matches: [], rule })
    expect(new Set(r.entries.map((e) => e.rank)).size).toBe(1)
  })

  it('1試合でも終わっていれば、これまでどおり判定する', () => {
    const r = rank({
      entryIds: ['A', 'B', 'C', 'D'],
      matches: [mk('A', 'B', [[15, 9], [15, 11]])],
      rule,
    })
    expect(r.entries[0].entryId).toBe('A')
    expect(r.entries[0].reason).not.toBe('まだ試合が行われていません')
  })
})
