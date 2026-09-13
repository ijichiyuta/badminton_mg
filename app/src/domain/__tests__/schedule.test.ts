// タイムテーブル生成と採番のテスト。
// 第1号提供先の現行タイムテーブル（6コート × 30分 / 15ブロック / 90試合）を再現できるか。

import { describe, expect, it } from 'vitest'
import {
  assignReferees,
  buildSchedule,
  scheduleSummary,
  toTimetable,
  validateReferees,
  validateSchedule,
} from '../schedule'
import type { ScheduleBlock } from '../schedule'

const OPTS = { courtCount: 6, startTime: '9:30', slotMinutes: 30 }

function block(id: string, label: string, n: number): ScheduleBlock {
  return {
    id,
    label,
    entryIds: Array.from({ length: n }, (_, i) => `${id}-${i + 1}`),
    scoringRuleId: '15pt-3g-cap17',
  }
}

/** 第1号提供先の実態に近い構成：4チーム×15ブロック。 */
function realisticBlocks(): ScheduleBlock[] {
  return [
    block('m3-1', '男子3部1', 5),
    block('w3-1', '女子3部1', 5),
    block('w3-2', '女子3部2', 5),
    block('w3-3', '女子3部3', 5),
    block('m1', '男子1部', 4),
    block('m2-1', '男子2部1', 4),
    block('m2-2', '男子2部2', 4),
    block('m2-3', '男子2部3', 4),
    block('m3-2', '男子3部2', 4),
    block('m3-3', '男子3部3', 4),
    block('m3-4', '男子3部4', 4),
    block('w2-1', '女子2部1', 4),
    block('w2-2', '女子2部2', 4),
  ]
}

describe('buildSchedule — 基本', () => {
  it('4チーム1ブロックは6試合', () => {
    const s = buildSchedule([block('a', 'A組', 4)], OPTS)
    expect(s).toHaveLength(6)
    expect(s.map((m) => m.numberInGroup)).toEqual([1, 2, 3, 4, 5, 6])
    expect(s.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('5チーム1ブロックは10試合', () => {
    expect(buildSchedule([block('a', 'A組', 5)], OPTS)).toHaveLength(10)
  })

  it('通し番号は1から連番で、重複しない', () => {
    const s = buildSchedule(realisticBlocks(), OPTS)
    expect(s.map((m) => m.number)).toEqual(s.map((_, i) => i + 1))
  })

  it('ブロック内番号はブロックごとに1から振り直す', () => {
    const s = buildSchedule([block('a', 'A組', 4), block('b', 'B組', 4)], OPTS)
    const a = s.filter((m) => m.blockId === 'a').map((m) => m.numberInGroup)
    const b = s.filter((m) => m.blockId === 'b').map((m) => m.numberInGroup)
    expect(a).toEqual([1, 2, 3, 4, 5, 6])
    expect(b).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('対戦相手はブロックの並び順から引く', () => {
    const s = buildSchedule([block('a', 'A組', 4)], OPTS)
    // ① は 1-2、② は 3-4
    expect(s[0].entryIds).toEqual(['a-1', 'a-2'])
    expect(s[1].entryIds).toEqual(['a-3', 'a-4'])
    expect(s[2].entryIds).toEqual(['a-1', 'a-3'])
  })
})

describe('ラウンド優先で並べる — 現行のタイムテーブルと同じ構造', () => {
  const s = buildSchedule(realisticBlocks(), OPTS)

  it('最初の枠は各ブロックの①②が2コートずつ並ぶ', () => {
    const first = s.slice(0, 6)
    expect(first.map((m) => [m.blockLabel, m.numberInGroup])).toEqual([
      ['男子3部1', 1],
      ['男子3部1', 2],
      ['女子3部1', 1],
      ['女子3部1', 2],
      ['女子3部2', 1],
      ['女子3部2', 2],
    ])
  })

  it('全ブロックが①②を終えてから③④に進む', () => {
    const round1 = s.filter((m) => m.round === 1)
    const round2 = s.filter((m) => m.round === 2)
    const lastOfRound1 = Math.max(...round1.map((m) => m.number))
    const firstOfRound2 = Math.min(...round2.map((m) => m.number))
    expect(firstOfRound2).toBeGreaterThan(lastOfRound1)
  })

  it('コートは1から順に埋まり、超えたら次の枠へ', () => {
    expect(s.slice(0, 6).map((m) => m.court)).toEqual([1, 2, 3, 4, 5, 6])
    expect(s[6].court).toBe(1)
    expect(s[0].scheduledAt).toBe('09:30')
    expect(s[6].scheduledAt).toBe('10:00')
    expect(s[12].scheduledAt).toBe('10:30')
  })
})

describe('第1号提供先の規模を再現する', () => {
  // 60組。4チーム×15ブロックなら90試合。
  const blocks = Array.from({ length: 15 }, (_, i) => block(`b${i + 1}`, `ブロック${i + 1}`, 4))
  const s = buildSchedule(blocks, OPTS)

  it('90試合になる', () => {
    expect(s).toHaveLength(90)
  })

  it('6コートなら15枠、9:30開始で最終枠は16:30', () => {
    const sum = scheduleSummary(s, 6)
    expect(sum.matchCount).toBe(90)
    expect(sum.slotCount).toBe(15)
    expect(sum.firstTime).toBe('09:30')
    expect(sum.lastTime).toBe('16:30')
  })

  it('同一エントリーの二重割当がない', () => {
    expect(validateSchedule(s).filter((i) => i.kind === 'DOUBLE_BOOKED')).toEqual([])
  })
})

describe('回帰：ブロック数が少なくても二重割当を起こさない', () => {
  // 監査で見つけた不具合。単純にコートへ詰めると、
  // 4チーム1ブロックの6試合が6コートに同時に並び、同じペアが3コートに出ていた。
  it('4チーム1ブロックを6コートに流しても衝突しない', () => {
    const s = buildSchedule([block('a', 'A組', 4)], OPTS)
    expect(validateSchedule(s)).toEqual([])
    // 同時に流せるのは2試合まで。6試合＝3枠になる。
    expect(new Set(s.map((m) => m.scheduledAt)).size).toBe(3)
  })

  it('3チームブロックは同時1試合まで', () => {
    const s = buildSchedule([block('a', 'A組', 3)], OPTS)
    expect(validateSchedule(s)).toEqual([])
    expect(new Set(s.map((m) => m.scheduledAt)).size).toBe(3)
  })

  it('2ブロックでも衝突しない', () => {
    const s = buildSchedule([block('a', 'A組', 4), block('b', 'B組', 4)], OPTS)
    expect(validateSchedule(s)).toEqual([])
  })

  it('ブロック数・チーム数を変えても常に衝突しない', () => {
    for (const blockCount of [1, 2, 3, 5, 15]) {
      for (const teams of [3, 4, 5, 6]) {
        const bs = Array.from({ length: blockCount }, (_, i) => block(`b${i}`, `B${i}`, teams))
        const s = buildSchedule(bs, OPTS)
        expect(validateSchedule(s), `${blockCount}ブロック×${teams}チーム`).toEqual([])
      }
    }
  })
})

describe('二重割当の検証', () => {
  it('同時刻に同じエントリーが2コートにいれば検出する', () => {
    // コート数を1ブロックの同時試合数より多く取ると、
    // 別ブロックの試合が同じ枠に入るだけで衝突はしない。
    // ここでは意図的に衝突するデータを作る。
    const s = buildSchedule([block('a', 'A組', 4)], { ...OPTS, courtCount: 6 })
    const broken = s.map((m, i) => (i === 1 ? { ...m, entryIds: s[0].entryIds } : m))
    const issues = validateSchedule(broken)
    expect(issues.some((i) => i.kind === 'DOUBLE_BOOKED')).toBe(true)
  })

  it('最低インターバルを設定すると連続試合を警告する', () => {
    const s = buildSchedule([block('a', 'A組', 4)], { ...OPTS, courtCount: 2 })
    const issues = validateSchedule(s, { minIntervalSlots: 1 })
    expect(issues.some((i) => i.kind === 'BACK_TO_BACK')).toBe(true)
  })

  it('既定では連続試合を警告しない', () => {
    const s = buildSchedule([block('a', 'A組', 4)], { ...OPTS, courtCount: 2 })
    expect(validateSchedule(s).some((i) => i.kind === 'BACK_TO_BACK')).toBe(false)
  })
})

describe('toTimetable — コート × 時刻のグリッド', () => {
  const s = buildSchedule(realisticBlocks(), OPTS)
  const t = toTimetable(s, 6)

  it('時刻順に並ぶ', () => {
    expect(t[0].time).toBe('09:30')
    expect(t[1].time).toBe('10:00')
    expect(t.map((r) => r.time)).toEqual([...t.map((r) => r.time)].sort())
  })

  it('各行がコート数分のセルを持つ', () => {
    for (const row of t) expect(row.cells).toHaveLength(6)
  })

  it('セルに通し番号・ブロック名・ブロック内番号が入る', () => {
    const c = t[0].cells[0].match
    expect(c?.number).toBe(1)
    expect(c?.blockLabel).toBe('男子3部1')
    expect(c?.numberInGroup).toBe(1)
  })

  it('埋まらないコートは null になる', () => {
    // 3チームブロックは同時1試合しか流せないため、3試合＝3枠になる。
    const s2 = buildSchedule([block('a', 'A組', 3)], OPTS)
    const t2 = toTimetable(s2, 6)
    expect(t2).toHaveLength(3)
    expect(t2[0].cells.slice(1).every((c) => c.match === null)).toBe(true)
  })
})

describe('審判の割当 — 要項でルール化されている', () => {
  const s = buildSchedule(realisticBlocks(), OPTS)
  const refs = assignReferees(s, { style: 'LOSER', firstMatchRefereeRow: 3, courtCount: 6 })

  it('全試合に割当が出る', () => {
    expect(refs).toHaveLength(s.length)
  })

  it('第1枠はタイムテーブル3段目・同じコートの選手に頼む', () => {
    const rows = toTimetable(s, 6)
    for (let c = 0; c < 6; c++) {
      const ref = refs.find((r) => r.matchNumber === (rows[0].cells[c].match as { number: number }).number)
      expect(ref?.note).toContain('3段目')
      // 3段目＝rows[2]。1段目の2つ下であって3つ下ではない。
      expect(ref?.fromMatchNumber).toBe((rows[2].cells[c].match as { number: number }).number)
    }
  })

  it('第2枠以降は同じコートの1つ前の段の敗者審', () => {
    const rows = toTimetable(s, 6)
    const target = rows[1].cells[0].match as { number: number }
    const ref = refs.find((r) => r.matchNumber === target.number)
    expect(ref?.note).toContain('敗者2名')
    expect(ref?.fromMatchNumber).toBe((rows[0].cells[0].match as { number: number }).number)
  })

  it('相互審判の設定では割当を出さない', () => {
    const mutual = assignReferees(s, { style: 'MUTUAL', firstMatchRefereeRow: 3, courtCount: 6 })
    expect(mutual.every((r) => r.fromMatchNumber === null)).toBe(true)
    expect(mutual[0].note).toBe('相互審判')
  })

  it('割当なしの設定では空文字', () => {
    const none = assignReferees(s, { style: 'NONE', firstMatchRefereeRow: 3, courtCount: 6 })
    expect(none.every((r) => r.note === '')).toBe(true)
  })
})

describe('回帰：監査で見つかった入力検証の穴', () => {
  it('不正な分・時を弾く', () => {
    expect(() => buildSchedule([block('a', 'A組', 4)], { ...OPTS, startTime: '9:75' })).toThrow()
    expect(() => buildSchedule([block('a', 'A組', 4)], { ...OPTS, startTime: '99:00' })).toThrow()
    expect(() => buildSchedule([block('a', 'A組', 4)], { ...OPTS, startTime: '23:59' })).not.toThrow()
  })

  it('コート数0や負の枠長を弾く', () => {
    expect(() => buildSchedule([block('a', 'A組', 4)], { ...OPTS, courtCount: 0 })).toThrow()
    expect(() => buildSchedule([block('a', 'A組', 4)], { ...OPTS, slotMinutes: 0 })).toThrow()
  })

  it('toTimetable はコート数より大きい番号の試合を落とさない', () => {
    const s = buildSchedule(realisticBlocks(), OPTS)
    const t = toTimetable(s, 4) // わざと少なく指定する
    const shown = t.flatMap((r) => r.cells).filter((c) => c.match !== null).length
    expect(shown).toBe(s.length)
    expect(t[0].cells.length).toBeGreaterThanOrEqual(6)
  })

  it('同一時刻・同一コートの重複を検出する', () => {
    const s = buildSchedule(realisticBlocks(), OPTS)
    const broken = s.map((m, i) => (i === 1 ? { ...m, court: s[0].court } : m))
    expect(validateSchedule(broken).some((i) => i.kind === 'COURT_COLLISION')).toBe(true)
  })
})

describe('審判割当の検証', () => {
  const s = buildSchedule(realisticBlocks(), OPTS)

  it('正しい割当なら衝突しない', () => {
    const refs = assignReferees(s, { style: 'LOSER', firstMatchRefereeRow: 3, courtCount: 6 })
    expect(validateReferees(s, refs)).toEqual([])
  })

  it('同時刻に試合中の選手を審判に指名していれば検出する', () => {
    const refs = assignReferees(s, { style: 'LOSER', firstMatchRefereeRow: 1, courtCount: 6 })
    expect(validateReferees(s, refs).some((i) => i.kind === 'REFEREE_CONFLICT')).toBe(true)
  })
})

describe('採点方式はブロックから引き継ぐ', () => {
  it('ブロックごとに違う採点方式が試合に乗る', () => {
    const bs: ScheduleBlock[] = [
      { ...block('a', '4チーム', 4), scoringRuleId: '15pt-3g-cap17' },
      { ...block('b', '5チーム', 5), scoringRuleId: '15pt-3g-nodeuce' },
    ]
    const s = buildSchedule(bs, OPTS)
    expect(s.filter((m) => m.blockId === 'a').every((m) => m.scoringRuleId === '15pt-3g-cap17')).toBe(true)
    expect(s.filter((m) => m.blockId === 'b').every((m) => m.scoringRuleId === '15pt-3g-nodeuce')).toBe(true)
  })
})

describe('境界', () => {
  it('ブロックが空なら試合も空', () => {
    expect(buildSchedule([], OPTS)).toEqual([])
  })
  it('1チームだけのブロックは試合が出ない', () => {
    expect(buildSchedule([block('a', 'A組', 1)], OPTS)).toEqual([])
  })
  it('不正な時刻はエラー', () => {
    expect(() => buildSchedule([block('a', 'A組', 4)], { ...OPTS, startTime: '9時半' })).toThrow()
  })
})
