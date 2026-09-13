// 進出処理のテスト。docs/04-formats.md 3節
// 「同一ブロック出身者が1回戦で当たってはならない」が最も間違えやすい。

import { describe, expect, it } from 'vitest'
import {
  advancerLabel,
  advancerSeedOrder,
  earliestSameGroupMeeting,
  groupName,
  hasSameGroupFirstRound,
  placeAdvancers,
  resolveBracket,
  selectWildcards,
} from '../advancement'
import type { GroupResult, WildcardCandidate } from '../advancement'

/**
 * 1回戦の対戦カード。ペア内の上下は表の描き方の問題なので、
 * 名前順に正規化して「誰と誰が当たるか」だけを比べる。
 */
function pairsOf(slots: { position: number; key: { groupIndex: number; rank: number } | null }[]) {
  const out: string[] = []
  for (let p = 1; p <= slots.length; p += 2) {
    const f = (k: { groupIndex: number; rank: number } | null) =>
      k ? `${groupName(k.groupIndex)}${k.rank}位` : 'BYE'
    const [x, y] = [f(slots[p - 1].key), f(slots[p].key)].sort()
    out.push(`${x} vs ${y}`)
  }
  return out.sort()
}

describe('advancerSeedOrder', () => {
  it('4ブロック各上位2名：1位を先に、2位はブロック列を半周ずらす', () => {
    expect(advancerSeedOrder(4, 2)).toEqual([
      { groupIndex: 0, rank: 1 },
      { groupIndex: 1, rank: 1 },
      { groupIndex: 2, rank: 1 },
      { groupIndex: 3, rank: 1 },
      { groupIndex: 2, rank: 2 },
      { groupIndex: 3, rank: 2 },
      { groupIndex: 0, rank: 2 },
      { groupIndex: 1, rank: 2 },
    ])
  })
  it('進出者数が groupCount × topN になる', () => {
    expect(advancerSeedOrder(5, 2)).toHaveLength(10)
    expect(advancerSeedOrder(3, 3)).toHaveLength(9)
  })
})

describe('placeAdvancers — 4ブロックから各上位2名', () => {
  const slots = placeAdvancers({ groupCount: 4, topN: 2 })

  it('docs/04-formats.md の標準配置と一致する', () => {
    expect(pairsOf(slots)).toEqual(
      [
        'A組1位 vs B組2位',
        'C組1位 vs D組2位',
        'A組2位 vs B組1位',
        'C組2位 vs D組1位',
      ]
        .map((s) => s.split(' vs ').sort().join(' vs '))
        .sort(),
    )
  })

  it('同一ブロック出身者が1回戦で当たらない', () => {
    expect(hasSameGroupFirstRound(slots)).toBe(false)
  })

  it('同組の1位と2位は決勝まで当たらない', () => {
    // 8ドローなら3ラウンド。決勝＝3回戦。
    expect(earliestSameGroupMeeting(slots)).toBe(3)
  })

  it('各ブロック1位が別の山に分かれる', () => {
    const half = slots.length / 2
    const firstHalfWinners = slots
      .slice(0, half)
      .filter((s) => s.key?.rank === 1)
      .map((s) => s.key?.groupIndex)
    expect(firstHalfWinners).toHaveLength(2)
  })
})

describe('placeAdvancers — その他の構成', () => {
  it('2ブロック各上位2名', () => {
    const slots = placeAdvancers({ groupCount: 2, topN: 2 })
    expect(slots).toHaveLength(4)
    expect(hasSameGroupFirstRound(slots)).toBe(false)
  })

  it('8ブロック各1位（全国団体戦の形）', () => {
    const slots = placeAdvancers({ groupCount: 8, topN: 1 })
    expect(slots).toHaveLength(8)
    expect(hasSameGroupFirstRound(slots)).toBe(false)
  })

  it('2ブロック各1位は1試合', () => {
    const slots = placeAdvancers({ groupCount: 2, topN: 1 })
    expect(slots).toHaveLength(2)
    expect(pairsOf(slots)).toEqual(['A組1位 vs B組1位'])  // 2ブロック各1位
  })

  it('3ブロック各上位2名は8ドローで BYE が2つ入る', () => {
    const slots = placeAdvancers({ groupCount: 3, topN: 2 })
    expect(slots).toHaveLength(8)
    expect(slots.filter((s) => s.isBye)).toHaveLength(2)
    expect(hasSameGroupFirstRound(slots)).toBe(false)
  })

  it('5ブロック各上位2名は16ドローで BYE が6つ入る', () => {
    const slots = placeAdvancers({ groupCount: 5, topN: 2 })
    expect(slots).toHaveLength(16)
    expect(slots.filter((s) => s.isBye)).toHaveLength(6)
    expect(hasSameGroupFirstRound(slots)).toBe(false)
  })

  it('BYE は上位シードの相手枠に入る＝1位が BYE を得る', () => {
    const slots = placeAdvancers({ groupCount: 3, topN: 2 })
    // A組1位の初戦相手が BYE
    const a1 = slots.find((s) => s.key?.groupIndex === 0 && s.key.rank === 1)
    expect(a1).toBeDefined()
    const oppPos = (a1 as { position: number }).position % 2 === 1
      ? (a1 as { position: number }).position + 1
      : (a1 as { position: number }).position - 1
    expect(slots[oppPos - 1].isBye).toBe(true)
  })

  it('ワイルドカード枠を積める', () => {
    const slots = placeAdvancers({ groupCount: 3, topN: 2, wildcards: 2 })
    expect(slots.filter((s) => s.key !== null)).toHaveLength(8)
    expect(slots.filter((s) => s.key?.groupIndex === -1)).toHaveLength(2)
  })

  it('SEQUENTIAL 配置では同一ブロックが早く当たりうる', () => {
    const cross = placeAdvancers({ groupCount: 4, topN: 2, placement: 'CROSS' })
    const seq = placeAdvancers({ groupCount: 4, topN: 2, placement: 'SEQUENTIAL' })
    expect(earliestSameGroupMeeting(cross)).toBeGreaterThanOrEqual(earliestSameGroupMeeting(seq))
  })

  it('多数のブロック構成でも1回戦の同組対戦が起きない', () => {
    for (const g of [2, 3, 4, 5, 6, 7, 8]) {
      for (const n of [1, 2]) {
        const slots = placeAdvancers({ groupCount: g, topN: n })
        expect(hasSameGroupFirstRound(slots), `${g}ブロック×上位${n}`).toBe(false)
      }
    }
  })
})

describe('advancerLabel', () => {
  it('未確定なら明示する', () => {
    expect(advancerLabel({ groupIndex: 2, rank: 1 }, false)).toBe('C組1位（未確定）')
    expect(advancerLabel({ groupIndex: 0, rank: 2 }, true)).toBe('A組2位')
  })
})

// ---------------------------------------------------------------------------

function results(completed: boolean[]): GroupResult[] {
  return completed.map((c, i) => ({
    groupIndex: i,
    completed: c,
    rankedEntryIds: [`g${i}-1st`, `g${i}-2nd`, `g${i}-3rd`],
  }))
}

describe('部分進出', () => {
  it('全ブロック完了なら全枠が埋まる', () => {
    const r = resolveBracket(results([true, true, true, true]), {
      groupCount: 4,
      topN: 2,
      allowPartial: true,
    })
    expect(r.hasUnconfirmed).toBe(false)
    expect(r.slots.filter((s) => s.entryId !== null)).toHaveLength(8)
  })

  it('一部だけ完了でも確定した分を先に配置できる', () => {
    const r = resolveBracket(results([true, true, false, false]), {
      groupCount: 4,
      topN: 2,
      allowPartial: true,
    })
    expect(r.slots.filter((s) => s.entryId !== null)).toHaveLength(4)
    expect(r.hasUnconfirmed).toBe(true)
  })

  it('未確定の枠はラベルを保持する', () => {
    const r = resolveBracket(results([true, true, false, false]), {
      groupCount: 4,
      topN: 2,
      allowPartial: true,
    })
    expect(r.unconfirmedLabels).toContain('C組1位（未確定）')
    expect(r.unconfirmedLabels).toContain('D組2位（未確定）')
  })

  it('allowPartial が false なら全ブロック完了まで1枠も埋めない', () => {
    const r = resolveBracket(results([true, true, true, false]), {
      groupCount: 4,
      topN: 2,
      allowPartial: false,
    })
    expect(r.slots.filter((s) => s.entryId !== null)).toHaveLength(0)
    expect(r.hasUnconfirmed).toBe(true)
  })

  it('完了ブロックの順位が足りなければ未確定のまま', () => {
    const rs: GroupResult[] = [
      { groupIndex: 0, completed: true, rankedEntryIds: ['only-one'] },
      { groupIndex: 1, completed: true, rankedEntryIds: ['a', 'b'] },
    ]
    const r = resolveBracket(rs, { groupCount: 2, topN: 2, allowPartial: true })
    expect(r.slots.filter((s) => s.entryId !== null)).toHaveLength(3)
    expect(r.unconfirmedLabels).toContain('A組2位（未確定）')
  })
})

// ---------------------------------------------------------------------------

describe('ワイルドカード', () => {
  const cands = (played: number[]): WildcardCandidate[] =>
    played.map((p, i) => ({
      entryId: `e${i}`,
      groupIndex: i,
      rankInGroup: 3,
      score: 1 - i * 0.1,
      played: p,
    }))

  it('成績上位から選ぶ', () => {
    const r = selectWildcards(cands([3, 3, 3, 3]), 2)
    expect(r.selected).toEqual(['e0', 'e1'])
    expect(r.warnings).toEqual([])
  })

  it('試合数が揃っていなければ警告する', () => {
    const r = selectWildcards(cands([3, 3, 4, 4]), 2)
    expect(r.warnings.some((w) => w.includes('実施試合数'))).toBe(true)
  })

  it('最後の枠が同成績なら警告する', () => {
    const cs: WildcardCandidate[] = [
      { entryId: 'a', groupIndex: 0, rankInGroup: 3, score: 0.9, played: 3 },
      { entryId: 'b', groupIndex: 1, rankInGroup: 3, score: 0.5, played: 3 },
      { entryId: 'c', groupIndex: 2, rankInGroup: 3, score: 0.5, played: 3 },
    ]
    const r = selectWildcards(cs, 2)
    expect(r.warnings.some((w) => w.includes('同成績'))).toBe(true)
  })

  it('枠が0なら何も選ばない', () => {
    expect(selectWildcards(cands([3, 3]), 0).selected).toEqual([])
  })
})
