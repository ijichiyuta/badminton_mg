// 実データ再現テスト。**これが唯一の受け入れテスト**（docs/12-roadmap.md）。
//
// 第64回 愛知県スポーツ祭典（2026-09-06）の公開されている組合せ表・タイムテーブルを
// そのまま入れて、同じ構造・同じ番号が出るかを確かめる。
//
// 要項を説明するより、この再現結果を見せるほうが提案として強い。

import { describe, expect, it } from 'vitest'
import { roundRobinPairings } from '../draw'
import { assignReferees, buildSchedule, toTimetable, validateSchedule } from '../schedule'
import type { ScheduleBlock } from '../schedule'
import {
  REAL_BLOCKS,
  REAL_M1_CIRCLED,
  REAL_M1_UPPER,
  REAL_SETUP,
  REAL_TIMETABLE,
} from './fixtures/njsf-2026-09-06'

/** 実物のブロック構成からスケジュール入力を作る。 */
function blocks(): ScheduleBlock[] {
  return REAL_BLOCKS.map((b, i) => ({
    id: `b${i}`,
    label: b.label,
    entryIds: Array.from({ length: b.teams }, (_, k) => `${b.label}-${k + 1}`),
    // 5チームリーグは「打ち切り」＝延長なし。4チームは上限17。
    scoringRuleId: b.teams === 5 ? REAL_SETUP.scoringPresetIdFor5 : REAL_SETUP.scoringPresetId,
  }))
}

const OPTS = {
  courtCount: REAL_SETUP.courtCount,
  startTime: REAL_SETUP.startTime,
  slotMinutes: REAL_SETUP.slotMinutes,
}

// ---------------------------------------------------------------------------

describe('規模が実物と一致する', () => {
  const bs = blocks()

  it('13ブロック', () => {
    expect(bs).toHaveLength(13)
  })

  it('56組', () => {
    expect(bs.reduce((s, b) => s + b.entryIds.length, 0)).toBe(REAL_SETUP.totalEntries)
  })

  it('5チームが4ブロック、4チームが9ブロック', () => {
    expect(bs.filter((b) => b.entryIds.length === 5)).toHaveLength(4)
    expect(bs.filter((b) => b.entryIds.length === 4)).toHaveLength(9)
  })

  it('94試合になる', () => {
    expect(buildSchedule(bs, OPTS)).toHaveLength(REAL_SETUP.totalMatches)
  })

  it('タイムテーブルの実物も94試合', () => {
    expect(REAL_TIMETABLE).toHaveLength(REAL_SETUP.totalMatches)
  })
})

describe('ブロックごとの試合数が一致する', () => {
  const s = buildSchedule(blocks(), OPTS)

  it('5チームは10試合、4チームは6試合', () => {
    for (const b of REAL_BLOCKS) {
      const mine = s.filter((m) => m.blockLabel === b.label)
      const real = REAL_TIMETABLE.filter((m) => m.block === b.label)
      const expected = b.teams === 5 ? 10 : 6
      expect(mine.length, `${b.label}（生成）`).toBe(expected)
      expect(real.length, `${b.label}（実物）`).toBe(expected)
    }
  })

  it('ブロック内番号が 1..N で重複しない', () => {
    for (const b of REAL_BLOCKS) {
      const nums = s
        .filter((m) => m.blockLabel === b.label)
        .map((m) => m.numberInGroup)
        .sort((x, y) => x - y)
      const n = b.teams === 5 ? 10 : 6
      expect(nums, b.label).toEqual(Array.from({ length: n }, (_, i) => i + 1))
    }
  })
})

describe('対戦の組み合わせが総当たりを網羅する', () => {
  const s = buildSchedule(blocks(), OPTS)

  it('各ブロックで全ペアがちょうど1回ずつ当たる', () => {
    for (const b of blocks()) {
      const ms = s.filter((m) => m.blockId === b.id)
      const seen = new Set(ms.map((m) => [...m.entryIds].sort().join('|')))
      const n = b.entryIds.length
      expect(seen.size, b.label).toBe((n * (n - 1)) / 2)
    }
  })
})

describe('星取表のマス内番号 — 男子1部で実物と突き合わせる', () => {
  const s = buildSchedule(blocks(), OPTS)
  const m1 = s.filter((m) => m.blockLabel === '男子1部')

  it('丸数字（ブロック内の試合順）が実物と一致する', () => {
    for (const [pair, circled] of Object.entries(REAL_M1_CIRCLED)) {
      const [a, b] = pair.split('-').map(Number)
      const found = m1.find(
        (m) =>
          (m.slotPair[0] === a && m.slotPair[1] === b) ||
          (m.slotPair[0] === b && m.slotPair[1] === a),
      )
      expect(found?.numberInGroup, `${pair} の丸数字`).toBe(circled)
    }
  })

  it('通し番号が実物と一致する', () => {
    for (const [pair, number] of Object.entries(REAL_M1_UPPER)) {
      const [a, b] = pair.split('-').map(Number)
      const found = m1.find(
        (m) =>
          (m.slotPair[0] === a && m.slotPair[1] === b) ||
          (m.slotPair[0] === b && m.slotPair[1] === a),
      )
      expect(found?.number, `${pair} の通し番号`).toBe(number)
    }
  })

  it('4チームの対戦順が現行どおり ① 1-2 / ② 3-4 / ③ 1-3 / ④ 2-4 / ⑤ 1-4 / ⑥ 2-3', () => {
    expect(roundRobinPairings(4)).toEqual([[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]])
  })
})

describe('タイムテーブルの構造が実物と一致する', () => {
  const s = buildSchedule(blocks(), OPTS)

  it('コートは通し番号から決まる（(n-1)%6+1）', () => {
    for (const m of s) {
      expect(m.court, `第${m.number}試合`).toBe(((m.number - 1) % 6) + 1)
    }
  })

  it('時刻は9:30から30分刻み', () => {
    expect(s[0].scheduledAt).toBe('09:30')
    expect(s[6].scheduledAt).toBe('10:00')
    expect(s[92].scheduledAt).toBe('17:00')
  })

  it('16枠で終わり、最終枠は17:00', () => {
    const rows = toTimetable(s, 6)
    expect(rows).toHaveLength(16)
    expect(rows[rows.length - 1].time).toBe('17:00')
  })

  it('同一エントリーの二重割当がない', () => {
    expect(validateSchedule(s)).toEqual([])
  })
})

describe('通し番号の一致率', () => {
  const s = buildSchedule(blocks(), OPTS)
  const mine = new Map(s.map((m) => [m.number, `${m.blockLabel}#${m.numberInGroup}`]))
  const real = new Map(REAL_TIMETABLE.map((m) => [m.number, `${m.block}#${m.numberInGroup}`]))

  const matched = [...real.keys()].filter((n) => mine.get(n) === real.get(n))

  it('前半52試合は完全に一致する', () => {
    const firstHalf = [...real.keys()].filter((n) => n <= 52)
    const ok = firstHalf.filter((n) => mine.get(n) === real.get(n))
    expect(ok).toHaveLength(firstHalf.length)
  })

  it('全体で8割以上が一致する', () => {
    // 実物は 69〜86 で5チームブロックの後半ラウンドを手前に差し込んでいる。
    // 組合せ表には「２段目よりコート指定はなくなり、６コート通しで
    // 左から順次あいたコートに入ります」「タイムテーブルは目安です」と
    // 明記されており、完全一致は要件ではない。
    // ただし星取表のマスに通し番号が出るため、一致率は高いほどよい。
    expect(matched.length / real.size).toBeGreaterThanOrEqual(0.8)
  })

  it('一致しない範囲を記録しておく', () => {
    const diff = [...real.keys()].filter((n) => mine.get(n) !== real.get(n))
    // 差分が出るのは 69〜86 の18試合だけであることを固定する。
    expect(Math.min(...diff)).toBeGreaterThanOrEqual(69)
    expect(Math.max(...diff)).toBeLessThanOrEqual(86)
  })
})

describe('審判の割当が要項どおり', () => {
  const s = buildSchedule(blocks(), OPTS)
  const refs = assignReferees(s, {
    style: 'LOSER',
    firstMatchRefereeRow: REAL_SETUP.firstMatchRefereeRow,
    courtCount: 6,
  })

  it('第1枠の審判は3段目（10:30）の同じコートの選手', () => {
    const rows = toTimetable(s, 6)
    for (let c = 0; c < 6; c++) {
      const first = rows[0].cells[c].match as { number: number }
      const third = rows[2].cells[c].match as { number: number }
      const ref = refs.find((r) => r.matchNumber === first.number)
      expect(ref?.fromMatchNumber, `${c + 1}コート`).toBe(third.number)
    }
    expect(rows[2].time).toBe('10:30')
  })

  it('2枠目以降は同じコートの1つ前の敗者審', () => {
    const rows = toTimetable(s, 6)
    const m = rows[1].cells[0].match as { number: number }
    const prev = rows[0].cells[0].match as { number: number }
    const ref = refs.find((r) => r.matchNumber === m.number)
    expect(ref?.fromMatchNumber).toBe(prev.number)
    expect(ref?.note).toContain('敗者2名')
  })
})

describe('採点方式がブロックごとに違う', () => {
  const s = buildSchedule(blocks(), OPTS)

  it('5チームリーグだけ延長なし', () => {
    for (const b of REAL_BLOCKS) {
      const ms = s.filter((m) => m.blockLabel === b.label)
      const expected =
        b.teams === 5 ? REAL_SETUP.scoringPresetIdFor5 : REAL_SETUP.scoringPresetId
      expect(new Set(ms.map((m) => m.scoringRuleId)), b.label).toEqual(new Set([expected]))
    }
  })

  it('大会全体では2種類の採点方式が混在する', () => {
    expect(new Set(s.map((m) => m.scoringRuleId)).size).toBe(2)
  })
})
