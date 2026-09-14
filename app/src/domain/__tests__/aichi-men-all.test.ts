// 実データ検証その3：愛知県社会人クラブリーグ 男子全24部を一括で通す。
//
// 男子1部だけの検証（aichi-league.test.ts）は公表集計値から Match を逆算していた。
// こちらは**速報ページの全ゲームスコアをそのまま入力**し、
// 集計結果が PDF の公表値と一致するか、順位が公表順位と一致するかを見る。
//
// 規模：355対戦 / 930マッチ / 2150ゲーム。棄権44・両者棄権1・途中棄権1を含む。
//
// **この規模の実データを通して初めて出る問題がある。**
// 単体テストで作る3チーム4チームの例では、棄権が絡む同率や、
// 率が小数第4位で分かれるケースが再現できない。

import { describe, expect, it } from 'vitest'
import { rank } from '../ranking'
import type { RankingContext } from '../ranking'
import { findRankingPreset } from '../presets'
import { AICHI_MEN, AICHI_WALKOVER } from './fixtures/aichi-men-101'
import type { AichiGroup } from './fixtures/aichi-men-101'
import { RULE_21, SCORING_RULES, mk } from './helpers'
import type { Match } from '../types'

const RULE = (() => {
  const p = findRankingPreset('team-league-aichi')
  if (!p) throw new Error('team-league-aichi プリセットがない')
  const { label: _l, wording: _w, ...r } = p
  return r
})()

/**
 * 1つの部の全対戦を Match に変換する。
 *
 * 棄権は **games を空にして resultType を立てるだけ**にする。
 * 0-126 を手で書き込まない。そこはエンジンが要項どおりに埋めるべき箇所で、
 * テストが先回りして書くと「エンジンが埋められること」を検証できなくなる。
 */
function buildMatches(g: AichiGroup): Match[] {
  const out: Match[] = []
  for (const [ai, bi, wo, score] of g.ties) {
    const a = g.teams[ai]
    const b = g.teams[bi]
    const tieId = `${g.key}-${ai}-${bi}`

    if (wo !== null) {
      // 2複1単なので3マッチぶん立てる。マッチ 0-3 はこれで出る。
      for (let i = 0; i < 3; i++) {
        out.push(
          mk(a, b, [], {
            tieId,
            scoringRuleId: RULE_21.id,
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
      const retired = seg.startsWith('R')
      const body = retired ? seg.slice(1) : seg
      const games = body.split(',').map((s) => {
        const [x, y] = s.split('-').map(Number)
        return [x, y] as [number, number]
      })
      // 勝者はスコアから判定させる。棄権マッチだけ退いた側を記録する。
      const won = games.filter(([x, y]) => x > y).length
      const lost = games.length - won
      out.push(
        mk(a, b, games, {
          tieId,
          scoringRuleId: RULE_21.id,
          ...(retired
            ? { resultType: 'RETIRED' as const, retiredEntryId: won > lost ? b : a }
            : {}),
        }),
      )
    }
  }
  return out
}

function ctxFor(g: AichiGroup): RankingContext {
  return { entryIds: g.teams, matches: buildMatches(g), rule: RULE, scoringRules: SCORING_RULES }
}

// ---------------------------------------------------------------------------

describe('データの規模と素性', () => {
  it('男子は1部から8部まで24グループ', () => {
    expect(AICHI_MEN).toHaveLength(24)
    expect(AICHI_MEN.map((g) => g.key)).toContain('m1')
    expect(AICHI_MEN.map((g) => g.key)).toContain('m8d')
  })

  it('原則6チームだが、5チームの部が実在する', () => {
    const sizes = AICHI_MEN.map((g) => g.teams.length)
    expect(sizes.filter((n) => n === 6)).toHaveLength(23)
    expect(sizes.filter((n) => n === 5)).toHaveLength(1)
  })

  it('各部は総当たり（対戦数が nC2 になっている）', () => {
    for (const g of AICHI_MEN) {
      const n = g.teams.length
      expect(g.ties, g.label).toHaveLength((n * (n - 1)) / 2)
      // 同じ組が2回出てこない
      const seen = new Set(g.ties.map(([a, b]) => [a, b].sort().join('-')))
      expect(seen.size, g.label).toBe(g.ties.length)
    }
  })

  it('公表順位は各部で1位から順に重複なく並ぶ', () => {
    for (const g of AICHI_MEN) {
      expect([...g.ranks].sort((a, b) => a - b), g.label).toEqual(
        g.teams.map((_, i) => i + 1),
      )
    }
  })

  it('棄権が全体の1割を超えている（例外ではなく日常）', () => {
    const all = AICHI_MEN.flatMap((g) => g.ties)
    const wo = all.filter(([, , k]) => k !== null)
    expect(all.length).toBe(355)
    expect(wo.length).toBeGreaterThan(all.length * 0.1)
  })

  it('個人名が混入していない（リポジトリは公開）', () => {
    // 元の速報ページは選手名を「姓 名」の形で載せている。
    // 書き出しているのはチーム名（団体名）とスコアだけで、氏名は落としてある。
    const text = AICHI_MEN.flatMap((g) => [...g.teams, ...g.ties.map((t) => t[3])]).join('\n')
    expect(text.match(/[一-龥]{1,3}[ \u3000]+[一-龥]{1,3}/g)).toBeNull()
    // スコア欄は数字とハイフンと区切り記号だけでできている。
    for (const g of AICHI_MEN) {
      for (const [, , , sc] of g.ties) {
        expect(/^[0-9,\-/R]*$/.test(sc), `${g.label} ${sc}`).toBe(true)
      }
    }
  })
})

describe('**全24部で公表集計値と一致する**', () => {
  for (const g of AICHI_MEN) {
    describe(g.label, () => {
      const r = rank(ctxFor(g))
      const of = (i: number) => r.entries.find((e) => e.entryId === g.teams[i])

      it('マッチ得失', () => {
        for (let i = 0; i < g.teams.length; i++) {
          const e = of(i)
          expect([e?.stats.matchesWon, e?.stats.matchesLost], g.teams[i]).toEqual(
            g.totalMatches[i],
          )
        }
      })

      it('ゲーム得失', () => {
        for (let i = 0; i < g.teams.length; i++) {
          const e = of(i)
          expect([e?.stats.gamesWon, e?.stats.gamesLost], g.teams[i]).toEqual(g.totalGames[i])
        }
      })

      it('ポイント得失', () => {
        for (let i = 0; i < g.teams.length; i++) {
          const e = of(i)
          expect([e?.stats.pointsWon, e?.stats.pointsLost], g.teams[i]).toEqual(
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
  const results = AICHI_MEN.map((g) => ({ g, r: rank(ctxFor(g)) }))

  it('24部すべてで順位が公表値と完全一致する', () => {
    const ng = results.filter(({ g, r }) =>
      g.teams.some((t, i) => r.entries.find((e) => e.entryId === t)?.rank !== g.ranks[i]),
    )
    expect(ng.map((x) => x.g.label)).toEqual([])
  })

  it('一度も抽選に落ちていない（全順位を要項で説明できる）', () => {
    const drawn = results.filter(({ r }) => r.warnings.some((w) => w.kind === 'DRAW_USED'))
    expect(drawn.map((x) => x.g.label)).toEqual([])
  })

  it('同順位が発生していない（公表順位が1〜nなので発生してはいけない）', () => {
    for (const { g, r } of results) {
      const ranks = r.entries.map((e) => e.rank)
      expect(new Set(ranks).size, g.label).toBe(g.teams.length)
    }
  })

  it('すべての順位に根拠テキストが付いている', () => {
    for (const { g, r } of results) {
      for (const e of r.entries) expect(e.reason, `${g.label} ${e.entryId}`).not.toBe('')
    }
  })
})

describe('棄権の扱いが要項どおり', () => {
  it('不戦敗は マッチ0-3 / ゲーム0-6 / ポイント0-126 になる', () => {
    // 大同特殊鋼BC は男子7部Bで5対戦すべて棄権している。
    const g = AICHI_MEN.find((x) => x.key === 'm7b')
    if (!g) throw new Error('m7b がない')
    const i = g.teams.indexOf('大同特殊鋼BC')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(g.ties.filter(([a, b, k]) => k !== null && (a === i || b === i))).toHaveLength(5)

    const e = rank(ctxFor(g)).entries.find((x) => x.entryId === g.teams[i])
    expect([e?.stats.matchesWon, e?.stats.matchesLost]).toEqual([0, 5 * AICHI_WALKOVER.matches[1]])
    expect([e?.stats.gamesWon, e?.stats.gamesLost]).toEqual([0, 5 * AICHI_WALKOVER.games[1]])
    expect([e?.stats.pointsWon, e?.stats.pointsLost]).toEqual([0, 5 * AICHI_WALKOVER.points[1]])
    // 1勝もしていないので最下位。
    expect(e?.rank).toBe(g.teams.length)
  })

  it('両者棄権は双方の負けになる（勝者を作らない）', () => {
    const g = AICHI_MEN.find((x) => x.key === 'm6b')
    if (!g) throw new Error('m6b がない')
    const tie = g.ties.find(([, , k]) => k === 'BOTH')
    if (!tie) throw new Error('両者棄権の対戦がない')
    const r = rank(ctxFor(g))
    for (const i of [tie[0], tie[1]]) {
      const e = r.entries.find((x) => x.entryId === g.teams[i])
      // 5対戦のうち1つが両者棄権。勝敗の合計が5のままであること（引き分け扱いにしない）。
      expect((e?.stats.wins ?? 0) + (e?.stats.losses ?? 0), g.teams[i]).toBe(5)
    }
  })
})
