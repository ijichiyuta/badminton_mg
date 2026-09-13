// 結果入力の状態機械のテスト。docs/15-ui-ux.md 第2部5
//
// 「1試合15秒 / 10試合3分」という目標は、この挙動が正しいことが前提になっている。
// 打鍵数をテストで固定する。

import { describe, expect, it } from 'vitest'
import {
  currentGames,
  displayValue,
  initScoreInput,
  isGameDisabled,
  scoreInputReducer,
  summarize,
  type ScoreInputState,
} from '../scoreInput'
import { RULE_15_CAP17, RULE_15_CAP21, RULE_15_NODEUCE, RULE_21, scoringRule } from '../../domain/__tests__/helpers'

/** 数字キーを順に叩く。`.` は確定（NEXT）。 */
function type(state: ScoreInputState, keys: string): ScoreInputState {
  let s = state
  for (const k of keys) {
    if (k === '.') s = scoreInputReducer(s, { type: 'NEXT' })
    else if (k === '<') s = scoreInputReducer(s, { type: 'BACKSPACE' })
    else s = scoreInputReducer(s, { type: 'DIGIT', digit: Number(k) })
  }
  return s
}

function shown(s: ScoreInputState): string[] {
  return s.cells.map(([a, b]) => `${displayValue(a) || '_'}-${displayValue(b) || '_'}`)
}

// ---------------------------------------------------------------------------

describe('自動補完 — 「9」と打つだけで 9 − 15 が入る', () => {
  it('基準点未満を打つと相手側に基準点が入る', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '9')
    expect(shown(s)[0]).toBe('9-15')
  })

  it('補完された値は auto として印が付く（何が自動かを隠さない）', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '9')
    expect(s.cells[0][0].auto).toBe(false)
    expect(s.cells[0][1].auto).toBe(true)
  })

  it('1打鍵で1ゲームが埋まり、次のゲームへ進む', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '9')
    expect(s.focus).toEqual({ game: 1, side: 'A' })
  })

  it('2打鍵で2ゲーム。2ゲーム先取なので決着する', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '95')
    expect(shown(s).slice(0, 2)).toEqual(['9-15', '5-15'])
    expect(summarize(s).decided).toBe(true)
    expect(summarize(s).winner).toBe('B')
  })

  it('21点制では21が補完される。点数はハードコードしない', () => {
    const s = type(initScoreInput(RULE_21), '9')
    expect(shown(s)[0]).toBe('9-21')
  })

  it('上限17の設定でも基準点は15', () => {
    const s = type(initScoreInput(RULE_15_CAP17), '9')
    expect(shown(s)[0]).toBe('9-15')
  })
})

describe('2桁の入力 — 確定できるまで待つ', () => {
  it('「1」だけでは確定しない（10〜19がありうる）', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '1')
    expect(s.focus).toEqual({ game: 0, side: 'A' })
    expect(displayValue(s.cells[0][0])).toBe('1')
    expect(s.cells[0][0].value).toBeNull()
  })

  it('「13」で確定して相手側に15が入る', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '13')
    expect(shown(s)[0]).toBe('13-15')
    expect(s.focus).toEqual({ game: 1, side: 'A' })
  })

  it('「15」は基準点なので補完せず、相手側のマスへ進む', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '15')
    expect(shown(s)[0]).toBe('15-_')
    expect(s.focus).toEqual({ game: 0, side: 'B' })
  })

  it('「15」→「9」で 15 − 9 になる', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '159')
    expect(shown(s)[0]).toBe('15-9')
  })

  it('「3」以上の1桁は即確定する（30は上限21を超える）', () => {
    for (const d of ['3', '4', '5', '6', '7', '8', '9']) {
      const s = type(initScoreInput(RULE_15_CAP21), d)
      expect(s.focus, `digit ${d}`).toEqual({ game: 1, side: 'A' })
    }
  })

  it('「2」は待つ（20がありうる）が、NEXT で確定できる', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '2')
    expect(s.focus).toEqual({ game: 0, side: 'A' })
    s = type(s, '.')
    expect(s.cells[0][0].value).toBe(2)
  })

  it('「0」は即確定する', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '0')
    expect(shown(s)[0]).toBe('0-15')
  })
})

describe('デュース域では補完しない', () => {
  it('「14」を打っても相手側は空のまま', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '14')
    expect(shown(s)[0]).toBe('14-_')
    expect(s.focus).toEqual({ game: 0, side: 'B' })
  })

  it('「14」→「16」で 14 − 16 になる', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '1416')
    expect(shown(s)[0]).toBe('14-16')
    expect(currentGames(s)[0]).toEqual({ scoreA: 14, scoreB: 16 })
  })

  it('上限17の設定では 16 − 14 が有効（2ゲーム入れて警告なし）', () => {
    const s = type(initScoreInput(RULE_15_CAP17), '1614' + '9')
    expect(shown(s).slice(0, 2)).toEqual(['16-14', '9-15'])
    // 1ゲームずつは有効。マッチとしては1勝1敗なので3ゲーム目が要る。
    expect(summarize(s).issues.map((i) => i.kind)).toEqual(['TOO_FEW_GAMES'])
    const done = type(s, '1513')
    expect(summarize(done).issues).toEqual([])
  })
})

describe('延長なしの設定', () => {
  it('15 − 14 が決着として扱われる', () => {
    const s = type(initScoreInput(RULE_15_NODEUCE), '1514' + '1512')
    expect(shown(s).slice(0, 2)).toEqual(['15-14', '15-12'])
    expect(summarize(s).issues).toEqual([])
    expect(summarize(s).winner).toBe('A')
  })
})

describe('3ゲーム目', () => {
  it('1勝1敗なら3ゲーム目を入力できる', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '9') // 9-15（B勝ち）
    s = type(s, '159') // 15-9（A勝ち）
    expect(isGameDisabled(s, 2)).toBe(false)
    s = type(s, '11')
    expect(shown(s)[2]).toBe('11-15')
  })

  it('2ゲーム先取で決着したら3ゲーム目は入力できない', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '95')
    expect(isGameDisabled(s, 2)).toBe(true)
    const after = type(s, '7')
    expect(shown(after)[2]).toBe('_-_')
  })

  it('決着後はフォーカスが進まない', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '95')
    expect(s.focus).toBeNull()
  })
})

describe('打鍵数 — 入力速度の根拠', () => {
  it('2-0 の試合は2打鍵', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '95')
    expect(summarize(s).decided).toBe(true)
    expect(currentGames(s)).toHaveLength(2)
  })

  it('2-1 の試合は「9」「159」「11」で6打鍵', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '9' + '159' + '11')
    expect(currentGames(s)).toHaveLength(3)
    expect(summarize(s).decided).toBe(true)
  })

  it('デュースを含む試合でも10打鍵に収まる', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '1416' + '159' + '1719')
    expect(shown(s)).toEqual(['14-16', '15-9', '17-19'])
  })
})

describe('取り消しと修正', () => {
  it('BACKSPACE で入力途中の桁を消す', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '1')
    s = type(s, '<')
    expect(displayValue(s.cells[0][0])).toBe('')
  })

  it('確定した値も消せる', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '15')
    s = scoreInputReducer(s, { type: 'FOCUS', game: 0, side: 'A' })
    s = type(s, '<')
    expect(s.cells[0][0].value).toBeNull()
  })

  it('空のマスで BACKSPACE すると1つ前へ戻って消す', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '15')
    expect(s.focus).toEqual({ game: 0, side: 'B' })
    s = type(s, '<')
    expect(s.focus).toEqual({ game: 0, side: 'A' })
    expect(s.cells[0][0].value).toBeNull()
  })

  it('自動補完された値をタップして打ち直せる', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '9')
    expect(s.cells[0][1].auto).toBe(true)
    s = scoreInputReducer(s, { type: 'FOCUS', game: 0, side: 'B' })
    s = type(s, '17')
    expect(shown(s)[0]).toBe('9-17')
    expect(s.cells[0][1].auto).toBe(false)
  })

  it('確定済みのマスに打ち直すと置き換わる（追記しない）', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '15')
    s = scoreInputReducer(s, { type: 'FOCUS', game: 0, side: 'A' })
    s = type(s, '9')
    expect(s.cells[0][0].value).toBe(9)
  })

  it('CLEAR で全部消える', () => {
    let s = type(initScoreInput(RULE_15_CAP21), '95')
    s = scoreInputReducer(s, { type: 'CLEAR' })
    expect(currentGames(s)).toEqual([])
    expect(s.focus).toEqual({ game: 0, side: 'A' })
  })
})

describe('警告はブロックしない（UX原則5）', () => {
  it('決着していないスコアでも確定できる', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '1514')
    const sum = summarize(s)
    expect(sum.issues.length).toBeGreaterThan(0)
    expect(sum.canSubmit).toBe(true)
  })

  it('1ゲームだけでも確定できる', () => {
    const s = type(initScoreInput(RULE_15_CAP21), '9')
    expect(summarize(s).canSubmit).toBe(true)
  })

  it('未入力なら確定できない', () => {
    expect(summarize(initScoreInput(RULE_15_CAP21)).canSubmit).toBe(false)
  })
})

describe('1ゲーム制', () => {
  const one = scoringRule('15pt-1g')
  it('マスは1行だけ', () => {
    expect(initScoreInput(one).cells).toHaveLength(1)
  })
  it('1打鍵で決着する', () => {
    const s = type(initScoreInput(one), '9')
    expect(summarize(s).decided).toBe(true)
    expect(summarize(s).winner).toBe('B')
  })
})

describe('既存の結果を読み込む', () => {
  it('入力済みのスコアから始められる', () => {
    const s = initScoreInput(RULE_15_CAP21, [
      { scoreA: 15, scoreB: 9 },
      { scoreA: 15, scoreB: 11 },
    ])
    expect(shown(s).slice(0, 2)).toEqual(['15-9', '15-11'])
    expect(summarize(s).winner).toBe('A')
  })
})

describe('時間制', () => {
  const t = scoringRule('time-10min')
  it('補完せず両方の入力を求める', () => {
    const s = type(initScoreInput(t), '9')
    expect(shown(s)[0]).toBe('9-_')
  })
  it('スコアの高い方が勝ち', () => {
    const s = type(initScoreInput(t), '97')
    expect(summarize(s).winner).toBe('A')
  })
})
