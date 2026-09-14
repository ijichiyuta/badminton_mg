// 星取表のマス判定。個人戦と団体戦で数える単位が違う。

import { describe, expect, it } from 'vitest'
import { cellView } from '../standings'
import type { MatchRecord } from '../../store/schema'

let seq = 0
function m(
  a: string,
  b: string,
  opts: Omit<Partial<MatchRecord>, 'games'> & { games?: [number, number][] } = {},
): MatchRecord {
  const { games = [], ...rest } = opts
  return {
    id: `m${++seq}`,
    tournamentId: 't',
    eventId: 'e',
    stageId: 's',
    groupId: 'g',
    tieId: null,
    number: seq,
    numberInGroup: 1,
    round: 1,
    slotInRound: 1,
    entryIds: [a, b],
    status: 'READY',
    resultType: 'NORMAL',
    games: games.map(([scoreA, scoreB]) => ({ scoreA, scoreB })),
    winnerEntryId: null,
    retiredEntryId: null,
    scoringRuleId: null,
    courtId: null,
    scheduledAt: null,
    completedAt: null,
    nextMatchId: null,
    loserNextMatchId: null,
    lineupSlot: null,
    ...rest,
  }
}

/** 2複1単の1対戦。勝った枠の数を指定する。 */
function tie(a: string, b: string, winners: (string | null)[]): MatchRecord[] {
  return winners.map((w, i) =>
    m(a, b, {
      tieId: 'tie1',
      lineupSlot: ['第1ダブルス', 'シングルス', '第2ダブルス'][i],
      status: w === null ? 'READY' : 'COMPLETED',
      winnerEntryId: w,
      games: w === null ? [] : w === a ? [[15, 9], [15, 11]] : [[9, 15], [11, 15]],
    }),
  )
}

describe('個人戦のマス', () => {
  it('ゲーム数で出す', () => {
    const v = cellView([m('A', 'B', { status: 'COMPLETED', winnerEntryId: 'A', games: [[15, 9], [11, 15], [15, 12]] })], 'A', 'B')
    expect(v?.score).toBe('2-1')
    expect(v?.won).toBe(true)
    expect(v?.done).toBe(true)
  })

  it('負けた側から見ると裏返る', () => {
    const ms = [m('A', 'B', { status: 'COMPLETED', winnerEntryId: 'A', games: [[15, 9], [15, 11]] })]
    expect(cellView(ms, 'B', 'A')?.score).toBe('0-2')
    expect(cellView(ms, 'B', 'A')?.won).toBe(false)
  })

  it('未入力なら結果を出さない', () => {
    const v = cellView([m('A', 'B')], 'A', 'B')
    expect(v?.done).toBe(false)
    expect(v?.score).toBeNull()
  })

  it('対戦がなければ null', () => {
    expect(cellView([m('A', 'B')], 'A', 'C')).toBeNull()
  })
})

describe('団体戦のマス', () => {
  it('**ゲーム数ではなくマッチ数で出す**', () => {
    const v = cellView(tie('A', 'B', ['A', 'B', 'A']), 'A', 'B')
    expect(v?.score).toBe('2-1')
    expect(v?.won).toBe(true)
    expect(v?.done).toBe(true)
  })

  it('過半数に達したら、残りが未消化でも決着として出す', () => {
    const v = cellView(tie('A', 'B', ['A', 'A', null]), 'A', 'B')
    expect(v?.done).toBe(true)
    expect(v?.decidedEarly).toBe(true)
    expect(v?.score).toBe('2-0')
  })

  it('1勝1敗で3試合目が残っていれば、まだ決着ではない', () => {
    const v = cellView(tie('A', 'B', ['A', 'B', null]), 'A', 'B')
    expect(v?.done).toBe(false)
    expect(v?.decidedEarly).toBe(false)
  })

  it('1試合も終わっていなければ結果を出さない', () => {
    const v = cellView(tie('A', 'B', [null, null, null]), 'A', 'B')
    expect(v?.done).toBe(false)
    expect(v?.score).toBeNull()
  })

  it('タップすると未入力の試合が開く', () => {
    const ms = tie('A', 'B', ['A', null, null])
    expect(cellView(ms, 'A', 'B')?.open.lineupSlot).toBe('シングルス')
  })

  it('全部終わっていれば先頭の試合が開く', () => {
    const ms = tie('A', 'B', ['A', 'A', 'B'])
    expect(cellView(ms, 'A', 'B')?.open.lineupSlot).toBe('第1ダブルス')
  })

  it('相手から見ると裏返る', () => {
    const ms = tie('A', 'B', ['A', 'B', 'A'])
    expect(cellView(ms, 'B', 'A')?.score).toBe('1-2')
    expect(cellView(ms, 'B', 'A')?.won).toBe(false)
  })

  it('3複でも5枠でも同じ数え方になる', () => {
    const five = ['A', 'B', 'A', 'B', 'A'].map((w, i) =>
      m('A', 'B', { tieId: 't5', lineupSlot: `枠${i + 1}`, status: 'COMPLETED', winnerEntryId: w }),
    )
    const v = cellView(five, 'A', 'B')
    expect(v?.score).toBe('3-2')
    expect(v?.won).toBe(true)
  })
})
