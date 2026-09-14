// 実データ検証その4：愛知県社会人クラブリーグ 第100回（後期）全45部門。
//
// その3（第101回・男子24部）は 2複1単・6チーム中心の均質なデータだった。
// こちらは**構成が揃っていない**ぶん、エンジンの前提を壊しに来る。
//
//   ・シニアは3複（D1/D2/D3）。1対戦=3マッチなのは同じだが単複の内訳が違う
//   ・7チーム編成が5部門、5チームが2部門
//   ・マッチ単位の不戦勝（対戦は実施し、その中の1マッチだけ棄権）
//   ・途中棄権の記法が2通り併存
//   ・**公表集計の行合計に誤りがある**

import { describe, expect, it } from 'vitest'
import { rank } from '../ranking'
import type { RankingContext } from '../ranking'
import { findRankingPreset } from '../presets'
import { AICHI_100, AICHI100_PUBLISHED_ERRORS } from './fixtures/aichi-100'
import type { Aichi100Group } from './fixtures/aichi-100'
import { RULE_21, SCORING_RULES, mk } from './helpers'
import type { Match } from '../types'

const RULE = (() => {
  const p = findRankingPreset('team-league-aichi')
  if (!p) throw new Error('team-league-aichi プリセットがない')
  const { label: _l, wording: _w, ...r } = p
  return r
})()

function buildMatches(g: Aichi100Group): Match[] {
  const out: Match[] = []
  for (const [ai, bi, wo, score] of g.ties) {
    const a = g.teams[ai]
    const b = g.teams[bi]
    const tieId = `${g.key}-${ai}-${bi}`
    const common = { tieId, scoringRuleId: RULE_21.id }

    // 対戦ごと棄権。3マッチぶん立てるだけで、0-126 は書き込まない。
    if (wo !== null) {
      for (let i = 0; i < 3; i++) {
        out.push(
          mk(a, b, [], {
            ...common,
            ...(wo === 'BOTH'
              ? { resultType: 'DOUBLE_WALKOVER' as const, winnerEntryId: null }
              : {
                  resultType: 'WALKOVER' as const,
                  winnerEntryId: wo === 'A' ? b : a,
                  retiredEntryId: wo === 'A' ? a : b,
                }),
          }),
        )
      }
      continue
    }

    for (const seg of score.split('/')) {
      // マッチ単位の不戦勝。対戦は実施されているが、このマッチだけ相手が現れなかった。
      if (seg === 'W' || seg === 'L') {
        out.push(
          mk(a, b, [], {
            ...common,
            resultType: 'WALKOVER',
            winnerEntryId: seg === 'W' ? a : b,
            retiredEntryId: seg === 'W' ? b : a,
          }),
        )
        continue
      }
      const retired = seg.startsWith('R')
      const body = retired ? seg.slice(1) : seg
      const games = body.split(',').map((s) => {
        const [x, y] = s.split('-').map(Number)
        return [x, y] as [number, number]
      })
      const won = games.filter(([x, y]) => x > y).length
      // **途中棄権のゲームは通常の判定では勝敗が決まらない。**
      // 10-0 のように、どちらも 21 点に届いていないスコアが残るため。
      // 記録された勝敗をそのまま使う（judgeMatch に任せると勝者なしになる）。
      out.push(
        mk(a, b, games, {
          ...common,
          ...(retired
            ? {
                resultType: 'RETIRED' as const,
                retiredEntryId: won > games.length - won ? b : a,
                winnerEntryId: won > games.length - won ? a : b,
              }
            : {}),
        }),
      )
    }
  }
  return out
}

const ctxFor = (g: Aichi100Group): RankingContext => ({
  entryIds: g.teams,
  matches: buildMatches(g),
  rule: RULE,
  scoringRules: SCORING_RULES,
})

/** 公表値。行合計に誤りが判明している行だけ差し替える。 */
function expectedGames(g: Aichi100Group, i: number): [number, number] {
  const c = AICHI100_PUBLISHED_ERRORS.find((x) => x.key === g.key && x.team === g.teams[i])
  return c ? c.games : g.totalGames[i]
}

// ---------------------------------------------------------------------------

describe('第100回のデータ構成', () => {
  it('45部門ある', () => {
    expect(AICHI_100).toHaveLength(45)
  })

  it('カテゴリの内訳', () => {
    const n = (c: string) => AICHI_100.filter((g) => g.category === c).length
    expect([n('男子'), n('女子'), n('シニア男子'), n('シニア女子')]).toEqual([25, 6, 10, 4])
  })

  it('**シニアは3複。一般は2複1単。**形式が部門で違う', () => {
    for (const g of AICHI_100) {
      const senior = g.category.startsWith('シニア')
      expect(g.format, g.label).toBe(senior ? '3D' : '2D1S')
    }
  })

  it('6チームは原則であって前提ではない（5・6・7が混在する）', () => {
    const sizes = AICHI_100.map((g) => g.teams.length).sort((a, b) => a - b)
    expect(sizes.filter((n) => n === 5)).toHaveLength(2)
    expect(sizes.filter((n) => n === 6)).toHaveLength(38)
    expect(sizes.filter((n) => n === 7)).toHaveLength(5)
  })

  it('各部門は総当たり', () => {
    for (const g of AICHI_100) {
      const n = g.teams.length
      expect(g.ties, g.label).toHaveLength((n * (n - 1)) / 2)
      expect(new Set(g.ties.map(([a, b]) => [a, b].sort().join('-'))).size, g.label).toBe(
        g.ties.length,
      )
    }
  })

  it('マッチ単位の不戦勝が存在する（対戦ごと棄権とは別物）', () => {
    const perMatch = AICHI_100.flatMap((g) => g.ties).filter(
      ([, , wo, s]) => wo === null && /(^|\/)(W|L)($|\/)/.test(s),
    )
    expect(perMatch.length).toBeGreaterThan(0)
  })

  it('個人名が混入していない（リポジトリは公開）', () => {
    const text = AICHI_100.flatMap((g) => [...g.teams, ...g.ties.map((t) => t[3])]).join('\n')
    expect(text.match(/[一-龥]{1,3}[ 　]+[一-龥]{1,3}/g)).toBeNull()
    for (const g of AICHI_100) {
      for (const [, , , sc] of g.ties) {
        expect(/^[0-9,\-/RWL]*$/.test(sc), `${g.label} ${sc}`).toBe(true)
      }
    }
  })
})

describe('**全45部門で公表集計値と一致する**', () => {
  for (const g of AICHI_100) {
    describe(g.label, () => {
      const r = rank(ctxFor(g))
      const of = (i: number) => r.entries.find((e) => e.entryId === g.teams[i])

      it('マッチ得失', () => {
        for (let i = 0; i < g.teams.length; i++) {
          expect([of(i)?.stats.matchesWon, of(i)?.stats.matchesLost], g.teams[i]).toEqual(
            g.totalMatches[i],
          )
        }
      })
      it('ゲーム得失', () => {
        for (let i = 0; i < g.teams.length; i++) {
          expect([of(i)?.stats.gamesWon, of(i)?.stats.gamesLost], g.teams[i]).toEqual(
            expectedGames(g, i),
          )
        }
      })
      it('ポイント得失', () => {
        for (let i = 0; i < g.teams.length; i++) {
          expect([of(i)?.stats.pointsWon, of(i)?.stats.pointsLost], g.teams[i]).toEqual(
            g.totalPoints[i],
          )
        }
      })
      it('順位', () => {
        for (let i = 0; i < g.teams.length; i++) {
          expect(of(i)?.rank, g.teams[i]).toBe(g.ranks[i])
        }
      })
    })
  }
})

describe('全体の通し', () => {
  const results = AICHI_100.map((g) => ({ g, r: rank(ctxFor(g)) }))

  it('45部門すべてで順位が公表値と一致する', () => {
    const ng = results.filter(({ g, r }) =>
      g.teams.some((t, i) => r.entries.find((e) => e.entryId === t)?.rank !== g.ranks[i]),
    )
    expect(ng.map((x) => x.g.label)).toEqual([])
  })

  it('一度も抽選に落ちていない', () => {
    expect(
      results.filter(({ r }) => r.warnings.some((w) => w.kind === 'DRAW_USED')).map((x) => x.g.label),
    ).toEqual([])
  })

  it('すべての順位に根拠が付いている', () => {
    for (const { g, r } of results) {
      for (const e of r.entries) expect(e.reason, `${g.label} ${e.entryId}`).not.toBe('')
    }
  })
})

describe('公表集計の行合計に誤りがある箇所', () => {
  it('3行ある。すべて男子8部A', () => {
    expect(AICHI100_PUBLISHED_ERRORS).toHaveLength(3)
    for (const c of AICHI100_PUBLISHED_ERRORS) expect(c.key).toBe('m8a')
  })

  it('**差はマッチ単位の不戦勝1件につきゲーム+1**', () => {
    const g = AICHI_100.find((x) => x.key === 'm8a')
    if (!g) throw new Error('m8a がない')
    for (const c of AICHI100_PUBLISHED_ERRORS) {
      const i = g.teams.indexOf(c.team)
      const [pw, pl] = g.totalGames[i]
      const [cw, cl] = c.games
      // そのチームが関わったマッチ単位の不戦勝の件数
      const n = g.ties.filter(
        ([a, b, wo, s]) => wo === null && (a === i || b === i) && /(^|\/)(W|L)($|\/)/.test(s),
      ).length
      expect(pw - cw + (pl - cl), c.team).toBe(n)
    }
  })

  it('誤りのある行でも順位は変わらない', () => {
    const g = AICHI_100.find((x) => x.key === 'm8a')
    if (!g) throw new Error('m8a がない')
    const r = rank(ctxFor(g))
    for (let i = 0; i < g.teams.length; i++) {
      expect(r.entries.find((e) => e.entryId === g.teams[i])?.rank, g.teams[i]).toBe(g.ranks[i])
    }
  })
})
