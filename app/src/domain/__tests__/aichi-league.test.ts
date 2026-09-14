// 実データ検証 その2：愛知県社会人クラブリーグ（団体戦・2複1単）。
//
// 新スポ連（個人戦・リーグ）とは別系統の、**JBA系の団体戦リーグ**。
// 順位決定基準が要項に明記されており、公表されている順位と突き合わせられる。
//
//   1. 勝敗による
//   2. マッチ得失率による
//   3. ゲーム得失率による
//   4. ポイント得失率による
//   5. 上記1〜4で決まらない場合は当事者同士で勝った方

import { describe, expect, it } from 'vitest'
import { rank } from '../ranking'
import type { RankingContext } from '../ranking'
import { findRankingPreset } from '../presets'
import { AICHI_M1, AICHI_SETUP } from './fixtures/aichi-league-101'
import { mk } from './helpers'
import type { Match } from '../types'

/**
 * 公表されている集計値から Match を組み立てる。
 *
 * 1つの Tie（3マッチ）を、**マッチ数・ゲーム数・ポイント数の合計が公表値と
 * 完全に一致する**ように Match 群として表現する。
 *
 * 1マッチ目に Tie 全体のゲームを載せ、残りのマッチは勝敗だけを持たせる。
 *
 * ゲームの配分は「**取ったゲームに自分の得点を、落としたゲームに相手の得点を寄せる**」。
 * これを守らないと、得点の多いゲームが実は負けゲームになり、ゲーム得失が狂う。
 *
 *   ・取ったゲーム gw 本： 1本目に `pw - (gw-1)` 点、残りは 1-0
 *   ・落としたゲーム gl 本：1本目に相手 `pl - (gl-1)` 点、残りは 0-1
 *
 * 合計が `pw` / `pl` にちょうど一致し、かつ各ゲームの勝敗も正しくなる。
 * **点数の見た目は実際の試合らしくないが、検証の対象は集計と順位なので問題ない。**
 */
function buildMatches(): Match[] {
  const out: Match[] = []
  const seen = new Set<string>()

  for (const team of AICHI_M1) {
    for (const tie of team.ties) {
      const key = [team.name, tie.opponent].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)

      const [mw, ml] = tie.matches
      const [gw, gl] = tie.games
      const [pw, pl] = tie.points
      const games: [number, number][] = []

      // 取ったゲーム：自分の得点を寄せる
      if (gw > 0) {
        games.push([pw - (gw - 1), 0])
        for (let k = 0; k < gw - 1; k++) games.push([1, 0])
      }
      // 落としたゲーム：相手の得点を寄せる
      if (gl > 0) {
        // gw が 0 なら自分の得点もここへ入れる（相手が上回るようにする）
        const mine = gw > 0 ? 0 : pw
        games.push([mine, Math.max(mine + 1, pl - (gl - 1))])
        for (let k = 0; k < gl - 1; k++) games.push([0, 1])
      }

      for (let i = 0; i < mw + ml; i++) {
        const won = i < mw
        out.push(
          mk(team.name, tie.opponent, i === 0 ? games : [], {
            winnerEntryId: won ? team.name : tie.opponent,
            // **同じ対戦の3マッチは同じ tieId を持つ。**
            // これがないと「勝敗」が対戦単位で数えられない。
            tieId: key,
          }),
        )
      }
    }
  }
  return out
}

const TEAMS = AICHI_M1.map((t) => t.name)

// ---------------------------------------------------------------------------

describe('大会の構成が要項どおり', () => {
  it('6チーム編成', () => {
    expect(AICHI_M1).toHaveLength(AICHI_SETUP.teamsPerGroup)
  })

  it('2複1単なので1対戦あたり3マッチ', () => {
    for (const t of AICHI_M1) {
      for (const tie of t.ties) {
        expect(tie.matches[0] + tie.matches[1], `${t.name} vs ${tie.opponent}`).toBe(
          AICHI_SETUP.matchesPerTie,
        )
      }
    }
  })

  it('各チーム5対戦 = 15マッチ', () => {
    for (const t of AICHI_M1) {
      expect(t.ties, t.name).toHaveLength(5)
      expect(t.totalMatches[0] + t.totalMatches[1], t.name).toBe(15)
    }
  })
})

describe('公表値の内部整合（書き起こしが正しいか）', () => {
  it('各チームのマッチ得失が対戦ごとの合計と一致する', () => {
    for (const t of AICHI_M1) {
      const w = t.ties.reduce((s, x) => s + x.matches[0], 0)
      const l = t.ties.reduce((s, x) => s + x.matches[1], 0)
      expect([w, l], t.name).toEqual(t.totalMatches)
    }
  })

  it('ゲーム得失が一致する', () => {
    for (const t of AICHI_M1) {
      const w = t.ties.reduce((s, x) => s + x.games[0], 0)
      const l = t.ties.reduce((s, x) => s + x.games[1], 0)
      expect([w, l], t.name).toEqual(t.totalGames)
    }
  })

  it('ポイント得失が一致する', () => {
    for (const t of AICHI_M1) {
      const w = t.ties.reduce((s, x) => s + x.points[0], 0)
      const l = t.ties.reduce((s, x) => s + x.points[1], 0)
      expect([w, l], t.name).toEqual(t.totalPoints)
    }
  })

  it('対戦表が対称になっている（A対Bの結果がB対Aの裏返し）', () => {
    for (const t of AICHI_M1) {
      for (const tie of t.ties) {
        const other = AICHI_M1.find((x) => x.name === tie.opponent)
        expect(other, tie.opponent).toBeDefined()
        const back = other?.ties.find((x) => x.opponent === t.name)
        expect(back, `${tie.opponent} → ${t.name}`).toBeDefined()
        expect([back?.matches[1], back?.matches[0]]).toEqual(tie.matches)
        expect([back?.games[1], back?.games[0]]).toEqual(tie.games)
        expect([back?.points[1], back?.points[0]]).toEqual(tie.points)
      }
    }
  })
})

describe('順位決定エンジンが公表順位を再現する', () => {
  const matches = buildMatches()

  // 要項どおりのプリセットをそのまま使う。テスト用に組み立て直さない。
  const rule = (() => {
    const p = findRankingPreset('team-league-aichi')
    if (!p) throw new Error('team-league-aichi プリセットがない')
    const { label: _l, wording: _w, ...r } = p
    return r
  })()

  const ctx = (): RankingContext => ({ entryIds: TEAMS, matches, rule })

  it('プリセットが要項の文面と対応している', () => {
    // 要項の「1. 勝敗 2. マッチ得失率 3. ゲーム得失率 4. ポイント得失率」と1対1で対応する。
    // wins は対戦（Tie）単位、matchRatio はマッチ単位。**階層が違うので両方要る。**
    expect(rule.criteria).toEqual(['wins', 'matchRatio', 'gameRatio', 'pointRatio'])
    expect(rule.tiebreakScope).toBe('ALL_MATCHES')
    expect(rule.unresolvedAction).toBe('HEAD_TO_HEAD')
  })

  it('**勝敗は対戦（Tie）単位で数える**。各チーム5対戦。', () => {
    const r = rank(ctx())
    for (const t of AICHI_M1) {
      const e = r.entries.find((x) => x.entryId === t.name)
      // 3マッチのうち2つ以上取った側がその対戦の勝ち。
      const won = t.ties.filter((x) => x.matches[0] > x.matches[1]).length
      expect([e?.stats.wins, e?.stats.losses], t.name).toEqual([won, 5 - won])
    }
  })

  it('マッチ得失は15マッチ単位で、公表値と一致する', () => {
    const r = rank(ctx())
    for (const t of AICHI_M1) {
      const e = r.entries.find((x) => x.entryId === t.name)
      expect([e?.stats.matchesWon, e?.stats.matchesLost], t.name).toEqual(t.totalMatches)
    }
  })

  it('ゲーム得失が公表値と一致する', () => {
    const r = rank(ctx())
    for (const t of AICHI_M1) {
      const e = r.entries.find((x) => x.entryId === t.name)
      expect([e?.stats.gamesWon, e?.stats.gamesLost], t.name).toEqual(t.totalGames)
    }
  })

  it('ポイント得失が公表値と一致する', () => {
    const r = rank(ctx())
    for (const t of AICHI_M1) {
      const e = r.entries.find((x) => x.entryId === t.name)
      expect([e?.stats.pointsWon, e?.stats.pointsLost], t.name).toEqual(t.totalPoints)
    }
  })

  it('**最終順位が公表値と完全に一致する**', () => {
    const r = rank(ctx())
    const mine = r.entries.map((e) => e.entryId)
    const official = [...AICHI_M1].sort((a, b) => a.rank - b.rank).map((t) => t.name)
    expect(mine).toEqual(official)
  })

  it('順位番号も一致する', () => {
    const r = rank(ctx())
    for (const t of AICHI_M1) {
      const e = r.entries.find((x) => x.entryId === t.name)
      expect(e?.rank, t.name).toBe(t.rank)
    }
  })

  it('抽選に落ちていない（全順位が根拠で説明できている）', () => {
    const r = rank(ctx())
    expect(r.warnings.some((w) => w.kind === 'DRAW_USED')).toBe(false)
    for (const e of r.entries) expect(e.reason).not.toBe('')
  })
})

describe('「決まらない場合は当事者同士で勝った方」', () => {
  const rule = (() => {
    const p = findRankingPreset('team-league-aichi')
    if (!p) throw new Error('missing')
    const { label: _l, wording: _w, ...r } = p
    return r
  })()

  const drawUsed = (r: { warnings: { kind: string }[] }) =>
    r.warnings.some((w) => w.kind === 'DRAW_USED')

  it('全基準で並んだ2者を直接対決で分ける', () => {
    // 4者総当たり。全試合を同じ 21-19 にすると、
    // 同じ勝敗数の者はマッチ率・ゲーム率・ポイント率がすべて一致する。
    // X と Y はどちらも2勝1敗。**差は「X が Y に勝っている」ことだけ。**
    const win = (a: string, b: string, tieId: string) =>
      mk(a, b, [[21, 19]], { winnerEntryId: a, tieId })
    const matches: Match[] = [
      win('X', 'Y', 't1'),
      win('X', 'Z', 't2'),
      win('W', 'X', 't3'),
      win('Y', 'Z', 't4'),
      win('Y', 'W', 't5'),
      win('Z', 'W', 't6'),
    ]

    const r = rank({ entryIds: ['X', 'Y', 'Z', 'W'], matches, rule })
    const x = r.entries.find((e) => e.entryId === 'X')
    const y = r.entries.find((e) => e.entryId === 'Y')

    // 全基準で並んでいることを確かめる。ここが崩れるとテストの意味がない。
    expect([x?.stats.wins, x?.stats.losses]).toEqual([y?.stats.wins, y?.stats.losses])
    expect(x?.stats.matchesWon).toBe(y?.stats.matchesWon)
    expect(x?.stats.gamesWon).toBe(y?.stats.gamesWon)
    expect(x?.stats.pointsWon).toBe(y?.stats.pointsWon)
    expect(x?.stats.pointsLost).toBe(y?.stats.pointsLost)

    // それでも X が上。
    const order = r.entries.map((e) => e.entryId)
    expect(order.indexOf('X')).toBeLessThan(order.indexOf('Y'))
    expect(x?.reason).toContain('当事者同士')
    expect(drawUsed(r)).toBe(false)
  })

  it('直接対決でも決まらなければ同順位にする（勝手に抽選しない）', () => {
    // A と B は一度も当たっていない。全基準で並ぶ。
    const ms: Match[] = [
      mk('A', 'C', [[21, 10]], { winnerEntryId: 'A', tieId: 'ac' }),
      mk('B', 'C', [[21, 10]], { winnerEntryId: 'B', tieId: 'bc' }),
    ]
    const r = rank({ entryIds: ['A', 'B', 'C'], matches: ms, rule })
    const a = r.entries.find((e) => e.entryId === 'A')
    const b = r.entries.find((e) => e.entryId === 'B')
    expect(a?.rank).toBe(b?.rank)
    expect(a?.reason).toContain('同順位')
    expect(drawUsed(r)).toBe(false)
  })
})
