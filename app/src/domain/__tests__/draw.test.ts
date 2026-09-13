// 組合せ生成のテスト。docs/04-formats.md
// シード位置とBYE配置は初版の仕様が誤っていた箇所（docs/14-review-findings.md A-1 / A-2）。

import { describe, expect, it } from 'vitest'
import {
  NJSF_PAIRINGS,
  bracketSize,
  buildBracket,
  byePositions,
  circleRounds,
  isCompleteRoundRobin,
  opponentSlot,
  roundRobinPairings,
  roundsAreDisjoint,
  roundsOf,
  seedOrder,
  seedPosition,
  splitIntoGroups,
} from '../draw'
import type { Entry } from '../types'

function entry(id: string, over: Partial<Entry> = {}): Entry {
  return { id, playerIds: [id], seed: null, status: 'ACTIVE', ...over }
}

// ---------------------------------------------------------------------------

describe('bracketSize', () => {
  it('参加数以上で最小の2のべき乗', () => {
    expect(bracketSize(13)).toBe(16)
    expect(bracketSize(16)).toBe(16)
    expect(bracketSize(17)).toBe(32)
    expect(bracketSize(2)).toBe(2)
    expect(bracketSize(3)).toBe(4)
  })
  it('128を超えたらエラー', () => {
    expect(() => bracketSize(129)).toThrow()
  })
})

describe('seedOrder — 標準ブラケット順を再帰生成する', () => {
  it('既知の並びと一致する', () => {
    expect(seedOrder(4)).toEqual([1, 4, 3, 2])
    expect(seedOrder(8)).toEqual([1, 8, 5, 4, 3, 6, 7, 2])
    expect(seedOrder(16)).toEqual([1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2])
  })

  it('32枠の上位シード位置', () => {
    const s = seedOrder(32)
    expect([s[0], s[1], s[2], s[3]]).toEqual([1, 32, 17, 16])
    expect([s[4], s[5], s[6], s[7]]).toEqual([9, 24, 25, 8])
  })

  // ここから下は docs/04-formats.md「検証済みの性質」をそのままテストにしたもの。
  for (const n of [4, 8, 16, 32, 64, 128]) {
    describe(`${n}枠`, () => {
      const s = seedOrder(n)
      it('自己逆写像である', () => {
        for (let i = 0; i < n; i++) expect(s[s[i] - 1]).toBe(i + 1)
      })
      it('1〜n がちょうど1回ずつ現れる', () => {
        expect(new Set(s).size).toBe(n)
      })
      it('1回戦の対戦カードはシード番号の和が n+1 になる', () => {
        const pos2seed = new Map<number, number>()
        s.forEach((pos, i) => pos2seed.set(pos, i + 1))
        for (let p = 1; p <= n; p += 2) {
          const a = pos2seed.get(p) as number
          const b = pos2seed.get(p + 1) as number
          expect(a + b).toBe(n + 1)
        }
      })
      if (n >= 8) {
        it('各クォーターに入るシード番号の和が等しい（旧版で崩れていた性質）', () => {
          const pos2seed = new Map<number, number>()
          s.forEach((pos, i) => pos2seed.set(pos, i + 1))
          const q = n / 4
          const sums: number[] = []
          for (let k = 0; k < 4; k++) {
            let sum = 0
            for (let p = k * q + 1; p <= (k + 1) * q; p++) sum += pos2seed.get(p) as number
            sums.push(sum)
          }
          expect(new Set(sums).size).toBe(1)
        })
      }
    })
  }

  it('16枠で第1シードと同じクォーターに入るのは第8シード', () => {
    const s = seedOrder(16)
    const quarterOf = (pos: number) => Math.floor((pos - 1) / 4)
    expect(quarterOf(s[0])).toBe(quarterOf(s[7]))
    // 第4シードと同じクォーターに入るのは第5シード
    expect(quarterOf(s[3])).toBe(quarterOf(s[4]))
  })

  it('2のべき乗でないサイズは拒否する', () => {
    expect(() => seedOrder(12)).toThrow()
  })
})

describe('byePositions — シード本人の枠ではなく初戦の相手枠', () => {
  it('16枠13名なら 2・15・10', () => {
    expect(byePositions(16, 13)).toEqual([2, 15, 10])
  })
  it('BYE の位置がシード本人の位置と重ならない', () => {
    const s = seedOrder(16)
    const byes = byePositions(16, 13)
    for (let seed = 1; seed <= 3; seed++) {
      expect(byes).not.toContain(s[seed - 1])
    }
  })
  it('第1シードの相手枠が最初に選ばれる', () => {
    expect(byePositions(16, 15)).toEqual([opponentSlot(seedPosition(1, 16))])
  })
  it('BYE がなければ空', () => {
    expect(byePositions(16, 16)).toEqual([])
  })
  it('BYE 数がシード数を超えても重複なく配置される', () => {
    const byes = byePositions(32, 20)
    expect(byes).toHaveLength(12)
    expect(new Set(byes).size).toBe(12)
  })
  it('参加数がブラケットの半分未満でも必要な数だけ配置する', () => {
    for (const [bracket, count] of [[8, 1], [8, 3], [16, 2], [16, 5]]) {
      const byes = byePositions(bracket, count)
      expect(byes, `${bracket}枠${count}名`).toHaveLength(bracket - count)
      expect(new Set(byes).size).toBe(bracket - count)
    }
  })
})

describe('opponentSlot', () => {
  it('奇数は+1、偶数は-1', () => {
    expect(opponentSlot(1)).toBe(2)
    expect(opponentSlot(2)).toBe(1)
    expect(opponentSlot(16)).toBe(15)
    expect(opponentSlot(9)).toBe(10)
  })
})

describe('buildBracket', () => {
  const mkEntries = (n: number, seeds = 0) =>
    Array.from({ length: n }, (_, i) => entry(`e${i + 1}`, { seed: i < seeds ? i + 1 : null }))

  it('16枠13名：全員が配置され、BYE が3つ入る', () => {
    const slots = buildBracket(mkEntries(13, 4), { drawSeed: 1 })
    expect(slots).toHaveLength(16)
    expect(slots.filter((s) => s.entryId !== null)).toHaveLength(13)
    expect(slots.filter((s) => s.isBye)).toHaveLength(3)
  })
  it('シードが標準位置に固定される', () => {
    const slots = buildBracket(mkEntries(13, 4), { drawSeed: 1 })
    const s = seedOrder(16)
    expect(slots[s[0] - 1].entryId).toBe('e1')
    expect(slots[s[1] - 1].entryId).toBe('e2')
    expect(slots[s[2] - 1].entryId).toBe('e3')
    expect(slots[s[3] - 1].entryId).toBe('e4')
  })
  it('第1シードが BYE で消えない', () => {
    const slots = buildBracket(mkEntries(13, 4), { drawSeed: 1 })
    const p1 = seedPosition(1, 16)
    expect(slots[p1 - 1].isBye).toBe(false)
    expect(slots[p1 - 1].entryId).toBe('e1')
  })
  it('同じシードなら結果が再現する', () => {
    const a = buildBracket(mkEntries(13, 4), { drawSeed: 7 }).map((s) => s.entryId)
    const b = buildBracket(mkEntries(13, 4), { drawSeed: 7 }).map((s) => s.entryId)
    expect(a).toEqual(b)
  })
  it('サイズが足りなければ黙って切り捨てずにエラーにする', () => {
    expect(() => buildBracket(mkEntries(8), { drawSeed: 1, size: 4 })).toThrow()
  })
  it('欠場者はブラケットに入らない', () => {
    const es = mkEntries(13, 4)
    es[5].status = 'WITHDRAWN'
    const slots = buildBracket(es, { drawSeed: 1 })
    expect(slots.map((s) => s.entryId)).not.toContain(es[5].id)
  })
})

// ---------------------------------------------------------------------------

describe('対戦順序 — 現行の組合せ表と一致させる', () => {
  it('4チームは ① 1-2 / ② 3-4 / ③ 1-3 / ④ 2-4 / ⑤ 1-4 / ⑥ 2-3', () => {
    expect(roundRobinPairings(4)).toEqual([[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]])
  })
  it('5チームは10試合で、実際の星取表と同じ並び', () => {
    expect(roundRobinPairings(5)).toEqual([
      [1, 2], [3, 4], [1, 5], [2, 3], [4, 5], [1, 3], [2, 4], [3, 5], [1, 4], [2, 5],
    ])
  })
  it('3チームは (1-2) (1-3) (2-3)', () => {
    expect(roundRobinPairings(3)).toEqual([[1, 2], [1, 3], [2, 3]])
  })

  for (const n of [3, 4, 5]) {
    it(`${n}チームの並びが総当たりを網羅する`, () => {
      expect(isCompleteRoundRobin(n, NJSF_PAIRINGS[n])).toBe(true)
    })
  }

  // 現行のタイムテーブルは ①② を2コートで同時に流す。
  // したがって「連続する2試合」は時間的には並行であり、そこで重複してはならない。
  it('4チームは2試合ずつのラウンドに切ると重複しない', () => {
    expect(roundsAreDisjoint(roundRobinPairings(4), 2)).toBe(true)
    expect(roundsOf(roundRobinPairings(4), 2)).toEqual([
      [[1, 2], [3, 4]],
      [[1, 3], [2, 4]],
      [[1, 4], [2, 3]],
    ])
  })
  it('5チームも2試合ずつのラウンドで重複しない', () => {
    expect(roundsAreDisjoint(roundRobinPairings(5), 2)).toBe(true)
  })

  it('表にない人数は巡回法に落ちる', () => {
    for (const n of [6, 7, 8, 9, 12]) {
      const ps = roundRobinPairings(n)
      expect(isCompleteRoundRobin(n, ps)).toBe(true)
    }
  })
})

describe('circleRounds', () => {
  for (const n of [3, 4, 5, 6, 7, 8, 12]) {
    it(`${n}人：各ラウンドで同じ選手は1回だけ`, () => {
      const rounds = circleRounds(n)
      for (const r of rounds) {
        const seen = new Set<number>()
        for (const [a, b] of r) {
          expect(seen.has(a)).toBe(false)
          expect(seen.has(b)).toBe(false)
          seen.add(a)
          seen.add(b)
        }
      }
    })
    it(`${n}人：総当たりを網羅する`, () => {
      expect(isCompleteRoundRobin(n, circleRounds(n).flat())).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------

describe('splitIntoGroups', () => {
  const mkEntries = (n: number, affs: string[] = []) =>
    Array.from({ length: n }, (_, i) =>
      entry(`e${i + 1}`, { affiliation: affs[i] ?? `club${i}` }),
    )

  it('ブロック数を指定して分割する', () => {
    const r = splitIntoGroups(mkEntries(16), {
      groupCount: 4,
      separateSameAffiliation: false,
      drawSeed: 1,
    })
    expect(r.groups.map((g) => g.length)).toEqual([4, 4, 4, 4])
  })

  it('1ブロックあたりの人数を指定して分割する', () => {
    const r = splitIntoGroups(mkEntries(16), {
      perGroup: 4,
      separateSameAffiliation: false,
      drawSeed: 1,
    })
    expect(r.groups).toHaveLength(4)
  })

  it('端数は上位のブロックへ多く配分する（3名・3名・2名）', () => {
    const r = splitIntoGroups(mkEntries(8), {
      groupCount: 3,
      separateSameAffiliation: false,
      drawSeed: 1,
    })
    expect(r.groups.map((g) => g.length)).toEqual([3, 3, 2])
  })

  it('第1号提供先の規模：60組を15ブロックに分けると全て4組', () => {
    const r = splitIntoGroups(mkEntries(60), {
      perGroup: 4,
      separateSameAffiliation: false,
      drawSeed: 1,
    })
    expect(r.groups).toHaveLength(15)
    expect(new Set(r.groups.map((g) => g.length))).toEqual(new Set([4]))
  })

  it('62組なら4組と5組が混ざる（現行の「4チームリーグ・5チームリーグ」）', () => {
    const r = splitIntoGroups(mkEntries(62), {
      perGroup: 4,
      separateSameAffiliation: false,
      drawSeed: 1,
    })
    expect(r.groups.reduce((s, g) => s + g.length, 0)).toBe(62)
    expect(r.groups).toHaveLength(15)
    expect(r.groups.filter((g) => g.length === 5)).toHaveLength(2)
    expect(r.groups.filter((g) => g.length === 4)).toHaveLength(13)
  })

  it('SPLIT を指定すると端数ぶんの小さいブロックを作る', () => {
    const r = splitIntoGroups(mkEntries(62), {
      perGroup: 4,
      remainderPolicy: 'SPLIT',
      separateSameAffiliation: false,
      drawSeed: 1,
    })
    expect(r.groups).toHaveLength(16)
    expect(r.groups.filter((g) => g.length === 3)).toHaveLength(2)
  })

  it('ちょうど割り切れるなら両ポリシーとも同じ', () => {
    const a = splitIntoGroups(mkEntries(60), { perGroup: 4, separateSameAffiliation: false, drawSeed: 1 })
    const b = splitIntoGroups(mkEntries(60), { perGroup: 4, remainderPolicy: 'SPLIT', separateSameAffiliation: false, drawSeed: 1 })
    expect(a.groups).toHaveLength(15)
    expect(b.groups).toHaveLength(15)
  })

  it('全員がいずれか1ブロックに入り、重複しない', () => {
    const r = splitIntoGroups(mkEntries(23), {
      groupCount: 6,
      separateSameAffiliation: false,
      drawSeed: 3,
    })
    const all = r.groups.flat()
    expect(all).toHaveLength(23)
    expect(new Set(all).size).toBe(23)
  })

  it('同一所属を別ブロックへ分ける', () => {
    // 4クラブ × 4名。4ブロックに分ければ完全に分離できるはず。
    const affs = Array.from({ length: 16 }, (_, i) => `club${i % 4}`)
    const r = splitIntoGroups(mkEntries(16, affs), {
      groupCount: 4,
      separateSameAffiliation: true,
      drawSeed: 5,
    })
    expect(r.unresolvedAffiliationGroups).toEqual([])
  })

  it('分離しきれない場合はブロックを報告する', () => {
    // 同一クラブ5名を4ブロックに分けるのは不可能。
    const affs = Array.from({ length: 8 }, (_, i) => (i < 5 ? 'same' : `club${i}`))
    const r = splitIntoGroups(mkEntries(8, affs), {
      groupCount: 4,
      separateSameAffiliation: true,
      drawSeed: 5,
    })
    expect(r.unresolvedAffiliationGroups.length).toBeGreaterThan(0)
  })

  it('欠場者は分割に含めない', () => {
    const es = mkEntries(9)
    es[0].status = 'WITHDRAWN'
    const r = splitIntoGroups(es, { groupCount: 2, separateSameAffiliation: false, drawSeed: 1 })
    expect(r.groups.flat()).toHaveLength(8)
    expect(r.groups.flat()).not.toContain(es[0].id)
  })

  it('同じシードなら結果が再現する', () => {
    const a = splitIntoGroups(mkEntries(20), { groupCount: 5, separateSameAffiliation: false, drawSeed: 9 })
    const b = splitIntoGroups(mkEntries(20), { groupCount: 5, separateSameAffiliation: false, drawSeed: 9 })
    expect(a.groups).toEqual(b.groups)
  })

  it('groupCount も perGroup もなければエラー', () => {
    expect(() =>
      splitIntoGroups(mkEntries(4), { separateSameAffiliation: false, drawSeed: 1 }),
    ).toThrow()
  })
})
