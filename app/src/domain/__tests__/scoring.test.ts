// 採点判定のテスト。docs/06-scoring.md
// 上限点は大会ごとに違う（17 / 21 / 延長なし）。境界値を方式ごとに確認する。

import { describe, expect, it } from 'vitest'
import {
  autoCompleteWinnerScore,
  describeRule,
  judgeGame,
  judgeMatch,
  remainingGames,
  validateScore,
} from '../scoring'
import { RULE_15_CAP17, RULE_15_CAP21, RULE_15_NODEUCE, RULE_21, scoringRule } from './helpers'

describe('judgeGame — 15点3ゲーム・最大21', () => {
  const r = RULE_15_CAP21
  it('基準点に達し2点差で決着', () => {
    expect(judgeGame(15, 9, r)).toBe('A')
    expect(judgeGame(9, 15, r)).toBe('B')
  })
  it('基準点に達しても2点差がなければ未決着', () => {
    expect(judgeGame(15, 14, r)).toBeNull()
  })
  it('デュースは2点差がつくまで続く', () => {
    expect(judgeGame(16, 14, r)).toBe('A')
    expect(judgeGame(17, 16, r)).toBeNull()
    expect(judgeGame(18, 16, r)).toBe('A')
  })
  it('上限21に達したら1点差でも決着', () => {
    expect(judgeGame(21, 20, r)).toBe('A')
    expect(judgeGame(20, 21, r)).toBe('B')
  })
  it('基準点未満は未決着', () => {
    expect(judgeGame(14, 3, r)).toBeNull()
  })
})

describe('T-23 上限の違いが境界値に効く', () => {
  it('最大17の設定では 16-14 が有効', () => {
    expect(judgeGame(16, 14, RULE_15_CAP17)).toBe('A')
  })
  it('最大17の設定では 17-16 が決着する（上限到達）', () => {
    expect(judgeGame(17, 16, RULE_15_CAP17)).toBe('A')
    // 同じスコアでも上限21の設定では未決着
    expect(judgeGame(17, 16, RULE_15_CAP21)).toBeNull()
  })
  it('上限21の設定では 18-16 が有効', () => {
    expect(judgeGame(18, 16, RULE_15_CAP21)).toBe('A')
  })
  it('21点制では 30-29 で決着し、29-28 は未決着ではない', () => {
    expect(judgeGame(30, 29, RULE_21)).toBe('A')
    expect(judgeGame(29, 28, RULE_21)).toBeNull()
    expect(judgeGame(30, 28, RULE_21)).toBe('A')
  })
})

describe('T-24 延長なし（要項の「打ち切り」）', () => {
  const r = RULE_15_NODEUCE
  it('15-14 で決着する', () => {
    expect(judgeGame(15, 14, r)).toBe('A')
  })
  it('14-13 は未決着', () => {
    expect(judgeGame(14, 13, r)).toBeNull()
  })
  it('「打ち切り」は団体戦の打ち切りとは別概念である', () => {
    expect(r.twoPointLead).toBe(false)
    expect(r.maxPoints).toBe(r.pointsPerGame)
  })
})

describe('上限なしの設定', () => {
  const r = scoringRule('15pt-3g-nocap')
  it('2点差がつくまで無制限に続く', () => {
    expect(judgeGame(21, 20, r)).toBeNull()
    expect(judgeGame(30, 29, r)).toBeNull()
    expect(judgeGame(31, 29, r)).toBe('A')
  })
})

describe('時間制', () => {
  const r = scoringRule('time-10min')
  it('スコアの高い方が勝ち', () => {
    expect(judgeGame(9, 7, r)).toBe('A')
    expect(judgeGame(3, 20, r)).toBe('B')
  })
  it('同点は未決着', () => {
    expect(judgeGame(11, 11, r)).toBeNull()
  })
  it('上限検証を行わない', () => {
    expect(validateScore([{ scoreA: 40, scoreB: 2 }], r)).toHaveLength(0)
  })
})

describe('judgeMatch', () => {
  const r = RULE_15_CAP21
  it('2ゲーム先取で決着', () => {
    const j = judgeMatch([{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 11 }], r)
    expect(j.winner).toBe('A')
    expect(j.decided).toBe(true)
    expect(j.gamesWonA).toBe(2)
  })
  it('1勝1敗では未決着', () => {
    const j = judgeMatch([{ scoreA: 15, scoreB: 9 }, { scoreA: 11, scoreB: 15 }], r)
    expect(j.winner).toBeNull()
    expect(j.decided).toBe(false)
  })
  it('3ゲーム目で決着', () => {
    const j = judgeMatch(
      [{ scoreA: 15, scoreB: 9 }, { scoreA: 11, scoreB: 15 }, { scoreA: 15, scoreB: 12 }],
      r,
    )
    expect(j.winner).toBe('A')
  })
  it('決着後の余分なゲームは勝敗に影響しない', () => {
    const j = judgeMatch(
      [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }, { scoreA: 0, scoreB: 15 }],
      r,
    )
    expect(j.winner).toBe('A')
    expect(j.gamesWonA).toBe(2)
    expect(j.gamesWonB).toBe(0)
  })
  it('1ゲーム制は1ゲームで決着', () => {
    const one = scoringRule('15pt-1g')
    expect(judgeMatch([{ scoreA: 15, scoreB: 12 }], one).winner).toBe('A')
  })
})

describe('remainingGames — 決着したらゲーム欄を畳む', () => {
  const r = RULE_15_CAP21
  it('決着後は0', () => {
    expect(remainingGames([{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 9 }], r)).toBe(0)
  })
  it('1勝1敗なら残り1', () => {
    expect(remainingGames([{ scoreA: 15, scoreB: 9 }, { scoreA: 9, scoreB: 15 }], r)).toBe(1)
  })
  it('未入力なら3', () => {
    expect(remainingGames([], r)).toBe(3)
  })
})

describe('autoCompleteWinnerScore — 「9」と打つだけで 15-9 が入る', () => {
  it('基準点未満なら基準点を補完する', () => {
    expect(autoCompleteWinnerScore(9, RULE_15_CAP21)).toBe(15)
    expect(autoCompleteWinnerScore(0, RULE_15_CAP21)).toBe(15)
    expect(autoCompleteWinnerScore(13, RULE_15_CAP21)).toBe(15)
  })
  it('デュース域（基準点-1以上）では補完しない', () => {
    expect(autoCompleteWinnerScore(14, RULE_15_CAP21)).toBeNull()
    expect(autoCompleteWinnerScore(19, RULE_15_CAP21)).toBeNull()
  })
  it('21点制では21を補完する。点数はハードコードしない', () => {
    expect(autoCompleteWinnerScore(19, RULE_21)).toBe(21)
    expect(autoCompleteWinnerScore(20, RULE_21)).toBeNull()
  })
  it('時間制では補完しない', () => {
    expect(autoCompleteWinnerScore(9, scoringRule('time-10min'))).toBeNull()
  })
})

describe('validateScore — 警告は出すがブロックしない', () => {
  const r = RULE_15_CAP21
  it('決着していないスコアを検出する', () => {
    const issues = validateScore([{ scoreA: 15, scoreB: 14 }], r)
    expect(issues.some((i) => i.kind === 'NOT_DECIDED')).toBe(true)
  })
  it('上限超過を検出する', () => {
    const issues = validateScore([{ scoreA: 22, scoreB: 20 }], r)
    expect(issues.some((i) => i.kind === 'OVER_MAX')).toBe(true)
  })
  it('先取ゲーム数に達していないことを検出する', () => {
    const issues = validateScore([{ scoreA: 15, scoreB: 9 }, { scoreA: 9, scoreB: 15 }], r)
    expect(issues.some((i) => i.kind === 'TOO_FEW_GAMES')).toBe(true)
  })
  it('決着後の余分なゲームを検出する', () => {
    const issues = validateScore(
      [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 8 }, { scoreA: 15, scoreB: 12 }],
      r,
    )
    expect(issues.some((i) => i.kind === 'EXTRA_GAMES')).toBe(true)
  })
  it('正しいスコアには警告を出さない', () => {
    expect(validateScore([{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 11 }], r)).toHaveLength(0)
    expect(validateScore([{ scoreA: 21, scoreB: 19 }], scoringRule('21pt-1g'))).toHaveLength(0)
    // 21-20 は 20オールからの1点差なので未決着。警告が出るのが正しい。
    expect(validateScore([{ scoreA: 21, scoreB: 20 }], scoringRule('21pt-1g'))).not.toHaveLength(0)
  })
  it('警告文に適用中の設定値を必ず添える', () => {
    const issues = validateScore([{ scoreA: 15, scoreB: 14 }], r)
    expect(issues[0].message).toContain('15点')
    expect(issues[0].message).toContain('21')
  })
})

describe('describeRule', () => {
  it('上限つき', () => {
    expect(describeRule(RULE_15_CAP17)).toBe('この種目は 15点3ゲーム制（上限17）の設定です')
  })
  it('延長なし', () => {
    expect(describeRule(RULE_15_NODEUCE)).toBe('この種目は 15点3ゲーム制（延長なし）の設定です')
  })
  it('時間制', () => {
    expect(describeRule(scoringRule('time-10min'))).toBe('この種目は 10分1本勝負 の設定です')
  })
})
