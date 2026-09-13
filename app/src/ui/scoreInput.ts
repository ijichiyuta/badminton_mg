// 結果入力の状態機械。docs/15-ui-ux.md 第2部5
//
// **DOM に依存しない純粋関数として書く。** 入力速度が製品の価値を決める箇所であり、
// 挙動をテストで固定しないと壊れたことに気づけない。
//
// 紙のスコアシートには両者の点数が書かれている。その通りに数字を順に打つ。
// タブ移動もタップも挟まない。

import { autoCompleteWinnerScore, judgeMatch, validateScore } from '../domain/scoring'
import type { Game, ScoringRuleSet } from '../domain/types'
import type { ScoreIssue } from '../domain/scoring'

export type Side = 'A' | 'B'

export interface Cell {
  /** 確定した値。未入力なら null。 */
  value: number | null
  /** 自動補完された値か。薄く表示して上書きできるようにする。何が自動かを隠さない。 */
  auto: boolean
  /** 入力途中の文字列。「1」を打った直後など。 */
  draft: string
}

export interface Focus {
  game: number
  side: Side
}

export interface ScoreInputState {
  rule: ScoringRuleSet
  cells: [Cell, Cell][]
  focus: Focus | null
}

export type ScoreInputAction =
  | { type: 'DIGIT'; digit: number }
  | { type: 'BACKSPACE' }
  | { type: 'FOCUS'; game: number; side: Side }
  | { type: 'NEXT' }
  | { type: 'CLEAR' }

const emptyCell = (): Cell => ({ value: null, auto: false, draft: '' })

export function initScoreInput(rule: ScoringRuleSet, games: Game[] = []): ScoreInputState {
  const cells: [Cell, Cell][] = Array.from({ length: rule.gamesPerMatch }, (_, i) => {
    const g = games[i]
    return [
      { value: g ? g.scoreA : null, auto: false, draft: '' },
      { value: g ? g.scoreB : null, auto: false, draft: '' },
    ]
  })
  return { rule, cells, focus: { game: 0, side: 'A' } }
}

/**
 * いま打っている値がこれ以上伸びないか。
 *
 * 15点制（上限21）なら「3」は 30 > 21 なので確定。「1」は 10〜19 がありうるので待つ。
 * 上限がなければ2桁で打ち切る。
 */
function isComplete(draft: string, rule: ScoringRuleSet): boolean {
  if (draft === '') return false
  const n = Number(draft)
  if (draft === '0') return true
  if (draft.length >= 2) return true
  const ceiling = rule.maxPoints ?? (rule.pointsPerGame ?? 0) * 2
  return n * 10 > ceiling
}

/** 表示に使う値。入力途中なら draft を優先する。 */
export function displayValue(cell: Cell): string {
  if (cell.draft !== '') return cell.draft
  return cell.value === null ? '' : String(cell.value)
}

/** 決着済みで、これ以上入力する必要のないゲームか。 */
export function isGameDisabled(state: ScoreInputState, game: number): boolean {
  const j = judgeMatch(currentGames(state), state.rule)
  if (!j.decided) return false
  // 決着した時点までのゲーム数を数える。
  let need = 0
  let a = 0
  let b = 0
  for (const [ca, cb] of state.cells) {
    if (ca.value === null || cb.value === null) break
    need++
    if (ca.value > cb.value) a++
    else if (cb.value > ca.value) b++
    if (a >= state.rule.gamesToWin || b >= state.rule.gamesToWin) break
  }
  return game >= need
}

/** 入力済みのゲーム。両方のマスが埋まっているものだけを返す。 */
export function currentGames(state: ScoreInputState): Game[] {
  const out: Game[] = []
  for (const [a, b] of state.cells) {
    if (a.value === null || b.value === null) break
    out.push({ scoreA: a.value, scoreB: b.value })
  }
  return out
}

export function issues(state: ScoreInputState): ScoreIssue[] {
  const games = currentGames(state)
  if (games.length === 0) return []
  return validateScore(games, state.rule)
}

function nextFocus(state: ScoreInputState, from: Focus): Focus | null {
  const order: Focus[] = []
  for (let g = 0; g < state.cells.length; g++) {
    order.push({ game: g, side: 'A' }, { game: g, side: 'B' })
  }
  const i = order.findIndex((f) => f.game === from.game && f.side === from.side)
  for (let k = i + 1; k < order.length; k++) {
    const f = order[k]
    if (isGameDisabled(state, f.game)) continue
    const cell = state.cells[f.game][f.side === 'A' ? 0 : 1]
    // 自動補完で埋まったマスは飛ばす。直したければタップすればよい。
    if (cell.auto) continue
    return f
  }
  return null
}

function cellAt(state: ScoreInputState, f: Focus): Cell {
  return state.cells[f.game][f.side === 'A' ? 0 : 1]
}

function withCell(state: ScoreInputState, f: Focus, cell: Cell): ScoreInputState {
  const cells = state.cells.map((pair, g) => {
    if (g !== f.game) return pair
    return (f.side === 'A' ? [cell, pair[1]] : [pair[0], cell]) as [Cell, Cell]
  })
  return { ...state, cells }
}

export function scoreInputReducer(
  state: ScoreInputState,
  action: ScoreInputAction,
): ScoreInputState {
  switch (action.type) {
    case 'CLEAR':
      return initScoreInput(state.rule)

    case 'FOCUS':
      return { ...state, focus: { game: action.game, side: action.side } }

    case 'NEXT': {
      if (!state.focus) return state
      const committed = commitDraft(state, state.focus)
      return { ...committed, focus: nextFocus(committed, state.focus) }
    }

    case 'BACKSPACE': {
      if (!state.focus) return state
      const f = state.focus
      const cell = cellAt(state, f)
      if (cell.draft !== '') {
        return withCell(state, f, { ...cell, draft: cell.draft.slice(0, -1) })
      }
      if (cell.value !== null) {
        return withCell(state, f, emptyCell())
      }
      // このマスが空なら1つ前へ戻して消す。
      const prev = prevFocus(state, f)
      if (!prev) return state
      return { ...withCell(state, prev, emptyCell()), focus: prev }
    }

    case 'DIGIT': {
      if (!state.focus) return state
      const f = state.focus
      if (isGameDisabled(state, f.game)) return state

      const cell = cellAt(state, f)
      // 確定済みのマスに打ち直したら、置き換えとして扱う。
      const base = cell.draft === '' && cell.value !== null ? '' : cell.draft
      const draft = base + String(action.digit)
      const next = withCell(state, f, { value: null, auto: false, draft })

      if (!isComplete(draft, state.rule)) return next
      return commitAndAdvance(next, f)
    }
  }
}

function prevFocus(state: ScoreInputState, from: Focus): Focus | null {
  const order: Focus[] = []
  for (let g = 0; g < state.cells.length; g++) {
    order.push({ game: g, side: 'A' }, { game: g, side: 'B' })
  }
  const i = order.findIndex((f) => f.game === from.game && f.side === from.side)
  return i > 0 ? order[i - 1] : null
}

/** 入力途中の draft を値として確定する。 */
function commitDraft(state: ScoreInputState, f: Focus): ScoreInputState {
  const cell = cellAt(state, f)
  if (cell.draft === '') return state
  return withCell(state, f, { value: Number(cell.draft), auto: false, draft: '' })
}

/**
 * 値を確定し、相手側を自動補完して次のマスへ進む。
 *
 * **基準点未満の数字を打つと、相手側に基準点が入る。**
 * 勝った側が基準点ちょうどで終わる試合が大半なので、1ゲームが実質1タップになる。
 * デュース域（基準点-1以上）では補完せず、両方の入力を求める。
 */
function commitAndAdvance(state: ScoreInputState, f: Focus): ScoreInputState {
  let next = commitDraft(state, f)
  const value = cellAt(next, f).value as number

  const partnerSide: Side = f.side === 'A' ? 'B' : 'A'
  const partner = cellAt(next, { game: f.game, side: partnerSide })
  const completed = autoCompleteWinnerScore(value, next.rule)

  if (completed !== null && partner.value === null && partner.draft === '') {
    next = withCell(next, { game: f.game, side: partnerSide }, {
      value: completed,
      auto: true,
      draft: '',
    })
  }

  return { ...next, focus: nextFocus(next, f) }
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

export interface ScoreInputSummary {
  games: Game[]
  /** 決着していれば 'A' | 'B'。判定できなければ null。 */
  winner: Side | null
  decided: boolean
  issues: ScoreIssue[]
  /** 確定ボタンを押せるか。**警告があっても押せる**（UX原則5）。 */
  canSubmit: boolean
}

export function summarize(state: ScoreInputState): ScoreInputSummary {
  const games = currentGames(state)
  const j = judgeMatch(games, state.rule)
  return {
    games,
    winner: j.winner,
    decided: j.decided,
    issues: issues(state),
    // 1ゲームでも入っていれば確定できる。警告はブロックしない。
    canSubmit: games.length > 0,
  }
}
