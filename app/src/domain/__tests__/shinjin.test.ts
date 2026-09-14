// 実データ検証その5：愛知県新人バドミントン大会 直近3期（12ドロー）。
//
// ここまでの検証はすべてリーグ戦（ROUND_ROBIN）だった。
// こちらは**単一トーナメント（SINGLE_ELIMINATION）**で、通る経路が違う。
//   ・ドローサイズと BYE の数
//   ・勝ち上がりの連結（勝者が次のラウンドに現れるか）
//   ・スコアからの勝敗判定（21点3ゲーム、デュースを含む実スコア1971件）
//
// 出場者は完全匿名。氏名も所属も持たない（未成年が参加するため）。

import { describe, expect, it } from 'vitest'
import { judgeMatch } from '../scoring'
import { SHINJIN, SHINJIN_DOUBLE_WALKOVERS } from './fixtures/shinjin'
import type { ShinjinDraw } from './fixtures/shinjin'
import { scoringRule } from './helpers'

const games = (sc: string) =>
  sc === ''
    ? []
    : sc
        .replace(/^R/, '')
        .split(',')
        .map((s) => {
          const [a, b] = s.split('-').map(Number)
          return { scoreA: a, scoreB: b }
        })

const byRound = (d: ShinjinDraw) => {
  const m = new Map<number, ShinjinDraw['matches']>()
  for (const x of d.matches) {
    const arr = m.get(x[0])
    if (arr) arr.push(x)
    else m.set(x[0], [x])
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
}

// ---------------------------------------------------------------------------

describe('データの素性', () => {
  it('3期 × 4種目 = 12ドロー', () => {
    expect(SHINJIN).toHaveLength(12)
    expect(new Set(SHINJIN.map((d) => d.edition))).toEqual(new Set(['147', '148', '149']))
    for (const ed of ['147', '148', '149']) {
      expect(SHINJIN.filter((d) => d.edition === ed), ed).toHaveLength(4)
    }
  })

  it('規模', () => {
    expect(SHINJIN.reduce((s, d) => s + d.entries, 0)).toBe(938)
    expect(SHINJIN.reduce((s, d) => s + d.matches.length, 0)).toBe(925)
  })

  it('個人が特定できる情報を持っていない', () => {
    const text = JSON.stringify(SHINJIN.map((d) => d.matches))
    // 出場者は数値の通し番号だけ。日本語が1文字も現れない。
    expect(/[ぁ-んァ-ヶ一-龥]/.test(text)).toBe(false)
  })
})

describe('トーナメントの骨格', () => {
  for (const d of SHINJIN) {
    describe(`${d.edition} ${d.event}`, () => {
      const rounds = byRound(d)

      it('決勝は1試合。そこへ向けて各ラウンドが半減する', () => {
        expect(rounds[rounds.length - 1]).toHaveLength(1)
        // 2回戦以降は必ず前のラウンドの半分になる（1回戦だけは BYE のぶん少ない）
        for (let i = 2; i < rounds.length; i++) {
          expect(rounds[i].length, d.roundLabels[i]).toBe(rounds[i - 1].length / 2)
        }
      })

      it('1回戦は2回戦の枠数に収まる（BYE のぶんだけ少ない）', () => {
        if (rounds.length < 2) return
        // 2回戦の枠数は 2 × 試合数。1回戦の勝者と BYE がここを埋める。
        const slots = rounds[1].length * 2
        expect(rounds[0].length, d.key).toBeLessThanOrEqual(slots)
        // BYE の数＝枠数 − 1回戦の試合数。負にならない。
        expect(slots - rounds[0].length, d.key).toBeGreaterThanOrEqual(0)
      })

      it('**勝者は必ず次のラウンドに現れる**', () => {
        for (let i = 0; i < rounds.length - 1; i++) {
          const next = new Set(rounds[i + 1].flatMap(([, , a, b]) => [a, b]))
          for (const [, no, , , win] of rounds[i]) {
            if (win === null) continue // 両者棄権。誰も上がらない
            expect(next.has(win), `${d.key} ${no}`).toBe(true)
          }
        }
      })

      it('同じ出場者が1つのラウンドに2回現れない', () => {
        for (const [ri, r] of rounds.entries()) {
          const ids = r.flatMap(([, , a, b]) => [a, b])
          expect(new Set(ids).size, `${d.key} R${ri + 1}`).toBe(ids.length)
        }
      })

      it('試合数は「出場者数 − 1 − 両者棄権の数」', () => {
        const dw = d.matches.filter(([, , , , , wo]) => wo === 'BOTH').length
        expect(d.matches.length).toBe(d.entries - 1 - dw)
      })
    })
  }
})

describe('この3期で 21点制 → 15点制 の切り替えが起きている', () => {
  it('第147回は21点制、第148回以降は15点制', () => {
    const by = (ed: string) => SHINJIN.filter((d) => d.edition === ed).map((d) => d.scoringRuleId)
    expect(new Set(by('147'))).toEqual(new Set(['21pt-3g']))
    expect(new Set(by('148'))).toEqual(new Set(['15pt-3g-cap21']))
    expect(new Set(by('149'))).toEqual(new Set(['15pt-3g-cap21']))
  })

  it('**15点制の大会でも最大21点まで出る**（14オール延長・上限21）', () => {
    for (const d of SHINJIN.filter((x) => x.scoringRuleId === '15pt-3g-cap21')) {
      const hi = d.matches.flatMap(([, , , , , , sc]) =>
        games(sc).map((g) => Math.max(g.scoreA, g.scoreB)),
      )
      if (hi.length === 0) continue
      expect(Math.max(...hi), d.key).toBeLessThanOrEqual(21)
      expect(Math.max(...hi), d.key).toBeGreaterThanOrEqual(15)
    }
  })

  it('21点制の大会では15点では終わらない', () => {
    for (const d of SHINJIN.filter((x) => x.scoringRuleId === '21pt-3g')) {
      const hi = d.matches.flatMap(([, , , , , , sc]) =>
        games(sc).map((g) => Math.max(g.scoreA, g.scoreB)),
      )
      if (hi.length === 0) continue
      expect(Math.min(...hi), d.key).toBeGreaterThanOrEqual(21)
    }
  })
})

describe('**スコアから判定した勝敗が、記録された勝敗と一致する**', () => {
  it('全1971ゲームを、その大会の採点方式で判定して矛盾がない', () => {
    const bad: string[] = []
    let n = 0
    for (const d of SHINJIN) {
      for (const [, no, a, b, win, wo, sc] of d.matches) {
        if (wo !== null) {
          expect(sc, `${d.key} ${no}`).toBe('')
          continue
        }
        const gs = games(sc)
        n += gs.length
        const j = judgeMatch(gs, scoringRule(d.scoringRuleId))
        const got = j.winner === 'A' ? a : j.winner === 'B' ? b : null
        if (got !== win) bad.push(`${d.key} ${no}: 記録=${win} 判定=${got} (${sc})`)
      }
    }
    expect(bad).toEqual([])
    expect(n).toBe(1971)
  })

  it('デュースの実例が含まれている（24-22 など）', () => {
    const deuce = SHINJIN.flatMap((d) => d.matches).filter(([, , , , , , sc]) =>
      games(sc).some((g) => Math.max(g.scoreA, g.scoreB) > 21),
    )
    expect(deuce.length).toBeGreaterThan(20)
  })

  it('どのゲームも、その大会の上限を超えていない', () => {
    for (const d of SHINJIN) {
      const rule = scoringRule(d.scoringRuleId)
      for (const [, no, , , , , sc] of d.matches) {
        for (const g of games(sc)) {
          expect(Math.max(g.scoreA, g.scoreB), `${d.key} ${no}`).toBeLessThanOrEqual(
            rule.maxPoints ?? 99,
          )
        }
      }
    }
  })
})

describe('棄権', () => {
  it('38件。ドローが埋まりきらない大会では常に起きる', () => {
    expect(SHINJIN.flatMap((d) => d.matches).filter(([, , , , , wo]) => wo !== null)).toHaveLength(
      38,
    )
  })

  it('**両者棄権は試合数の不変条件を壊す**', () => {
    for (const { key, no } of SHINJIN_DOUBLE_WALKOVERS) {
      const d = SHINJIN.find((x) => x.key === key)
      if (!d) throw new Error(key)
      const m = d.matches.find(([, n]) => n === no)
      expect(m?.[5]).toBe('BOTH')
      expect(m?.[4]).toBeNull()
      // 131人・129試合。通常なら130試合になるはずのところが1つ減る。
      expect(d.entries).toBe(131)
      expect(d.matches).toHaveLength(129)
    }
  })

  it('両者棄権の枠からは誰も次のラウンドへ進まない', () => {
    const d = SHINJIN.find((x) => x.key === '147-ms')
    if (!d) throw new Error('147-ms')
    const m = d.matches.find(([, n]) => n === 'MS-11')
    if (!m) throw new Error('MS-11')
    const next = new Set(
      d.matches.filter(([r]) => r === m[0] + 1).flatMap(([, , a, b]) => [a, b]),
    )
    expect(next.has(m[2])).toBe(false)
    expect(next.has(m[3])).toBe(false)
  })
})
