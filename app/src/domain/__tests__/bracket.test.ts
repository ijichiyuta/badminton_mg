// トーナメントの試合ツリー。実データ（愛知県新人大会）で見た形を再現できるか。

import { describe, expect, it } from 'vitest'
import { buildBracketMatches, byePositions, roundLabel, seedOrder } from '../draw'
import type { BracketSlot } from '../draw'

/** n 人が size のドローに入った状態の枠を作る。 */
function slots(size: number, n: number): BracketSlot[] {
  const s: BracketSlot[] = Array.from({ length: size }, (_, i) => ({
    position: i + 1,
    entryId: null,
    label: null,
    isBye: false,
  }))
  for (const p of byePositions(size, n)) s[p - 1].isBye = true
  const order = seedOrder(size)
  let k = 0
  for (const pos of order) {
    if (s[pos - 1].isBye) continue
    if (k >= n) break
    s[pos - 1].entryId = `e${++k}`
  }
  return s
}

describe('試合ツリーの骨格', () => {
  it('ちょうど埋まったドローは各ラウンドが半分ずつになる', () => {
    const ms = buildBracketMatches(slots(16, 16))
    const byRound = [1, 2, 3, 4].map((r) => ms.filter((m) => m.round === r).length)
    expect(byRound).toEqual([8, 4, 2, 1])
    expect(ms.filter((m) => m.isBye)).toHaveLength(0)
  })

  it('決勝だけが勝ち上がり先を持たない', () => {
    const ms = buildBracketMatches(slots(16, 16))
    const noNext = ms.filter((m) => m.next === null)
    expect(noNext).toHaveLength(1)
    expect(noNext[0].round).toBe(4)
  })

  it('勝ち上がり先は必ず存在する試合を指す', () => {
    const ms = buildBracketMatches(slots(32, 21))
    const key = (r: number, s: number) => `${r}-${s}`
    const exists = new Set(ms.map((m) => key(m.round, m.slotInRound)))
    for (const m of ms) {
      if (!m.next) continue
      expect(exists.has(key(m.next.round, m.next.slotInRound)), `${m.round}-${m.slotInRound}`).toBe(
        true,
      )
    }
  })

  it('2の冪でない枠数は受け付けない', () => {
    expect(() => buildBracketMatches(slots(16, 16).slice(0, 15))).toThrow(/2の冪/)
  })
})

describe('BYE の扱い', () => {
  it('**ドローが埋まらないときは1回戦が減る**', () => {
    // 131人が256の枠に入ると、1回戦の枠は128あっても**実施するのは3試合だけ**。
    // 残り125枠は BYE で、そのまま2回戦から始まる。
    // 愛知県新人大会の男子シングルスがこの形（131人・1回戦はごく少数）。
    const ms = buildBracketMatches(slots(256, 131))
    const r1 = ms.filter((m) => m.round === 1)
    expect(r1).toHaveLength(128)
    expect(r1.filter((m) => !m.isBye)).toHaveLength(3)
    expect(r1.filter((m) => m.isBye)).toHaveLength(125)
  })

  it('BYE の試合の相手は2回戦に入っている', () => {
    const ms = buildBracketMatches(slots(16, 10))
    const r2 = ms.filter((m) => m.round === 2)
    const carried = new Set(r2.flatMap((m) => m.entryIds).filter((x) => x !== null))
    for (const m of ms.filter((x) => x.round === 1 && x.isBye)) {
      const survivor = m.entryIds.find((x) => x !== null)
      expect(carried.has(survivor ?? ''), `${m.slotInRound}`).toBe(true)
    }
  })

  it('実施する試合の数は「出場者数 − 1」', () => {
    for (const [size, n] of [[16, 10], [32, 21], [64, 40], [256, 131]] as const) {
      const ms = buildBracketMatches(slots(size, n))
      expect(ms.filter((m) => !m.isBye), `${size}/${n}`).toHaveLength(n - 1)
    }
  })
})

describe('ラウンドの呼び方', () => {
  it('決勝から遡って数える', () => {
    expect([1, 2, 3, 4, 5].map((r) => roundLabel(r, 5))).toEqual([
      '1回戦',
      '2回戦',
      '準々決勝',
      '準決勝',
      '決勝',
    ])
  })

  it('2試合しかないドローは準決勝を飛ばして決勝だけ', () => {
    expect(roundLabel(1, 1)).toBe('決勝')
  })
})
