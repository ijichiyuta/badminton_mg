// タイムテーブル生成と採番のテスト。
// 第1号提供先の現行タイムテーブル（6コート × 30分 / 15ブロック / 90試合）を再現できるか。

import { describe, expect, it } from 'vitest'
import {
  assignReferees,
  buildSchedule,
  scheduleSummary,
  toTimetable,
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
    const s2 = buildSchedule([block('a', 'A組', 3)], OPTS) // 3試合
    const t2 = toTimetable(s2, 6)
    expect(t2).toHaveLength(1)
    expect(t2[0].cells.slice(3).every((c) => c.match === null)).toBe(true)
  })
})

describe('審判の割当 — 要項でルール化されている', () => {
  const s = buildSchedule(realisticBlocks(), OPTS)
  const refs = assignReferees(s, { style: 'LOSER', firstMatchRefereeOffsetRows: 3, courtCount: 6 })

  it('全試合に割当が出る', () => {
    expect(refs).toHaveLength(s.length)
  })

  it('第1枠はタイムテーブル3段目の選手に頼む', () => {
    for (let i = 0; i < 6; i++) {
      expect(refs[i].note).toContain('3段目')
      // 3段目＝6コート×3枠先
      expect(refs[i].fromMatchNumber).toBe(s[i + 18].number)
    }
  })

  it('第2枠以降は同じコートの1つ前の試合の敗者審', () => {
    const r = refs[6]
    expect(r.note).toContain('敗者2名')
    expect(r.fromMatchNumber).toBe(s[0].number)
  })

  it('相互審判の設定では割当を出さない', () => {
    const mutual = assignReferees(s, { style: 'MUTUAL', firstMatchRefereeOffsetRows: 3, courtCount: 6 })
    expect(mutual.every((r) => r.fromMatchNumber === null)).toBe(true)
    expect(mutual[0].note).toBe('相互審判')
  })

  it('割当なしの設定では空文字', () => {
    const none = assignReferees(s, { style: 'NONE', firstMatchRefereeOffsetRows: 3, courtCount: 6 })
    expect(none.every((r) => r.note === '')).toBe(true)
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
