// 採点判定。docs/06-scoring.md
//
// 点数はすべて ScoringRuleSet の値として引数で受け取る。
// このファイルに 15 / 17 / 21 / 30 という数値リテラルを書いてはならない（docs/adr/0005）。

import type { Game, Match, ScoringRuleSet } from './types'

export type Side = 'A' | 'B'

/** ゲームの決着判定。未決着なら null。 */
export function judgeGame(
  scoreA: number,
  scoreB: number,
  rule: ScoringRuleSet,
): Side | null {
  if (scoreA < 0 || scoreB < 0) return null

  if (rule.winCondition === 'TIME') {
    // 時間制は基準点を持たない。入力時点でスコアの高い方が勝ち。
    if (scoreA === scoreB) return null
    return scoreA > scoreB ? 'A' : 'B'
  }

  const hi = Math.max(scoreA, scoreB)
  const lo = Math.min(scoreA, scoreB)
  const winner: Side = scoreA > scoreB ? 'A' : 'B'

  if (rule.maxPoints !== null && hi >= rule.maxPoints) {
    // 上限に達したら1点差でも決着。
    return hi === lo ? null : winner
  }

  const base = rule.pointsPerGame
  if (base === null) return null
  if (hi < base) return null
  if (!rule.twoPointLead) return hi === lo ? null : winner
  return hi - lo >= 2 ? winner : null
}

export interface MatchJudgement {
  /** 勝者。未決着なら null。 */
  winner: Side | null
  gamesWonA: number
  gamesWonB: number
  /** これ以上ゲームを行う必要がないか。 */
  decided: boolean
}

/** マッチの決着判定。games は入力済みのゲームのみを渡す。 */
export function judgeMatch(games: Game[], rule: ScoringRuleSet): MatchJudgement {
  let a = 0
  let b = 0
  for (const g of games) {
    const w = judgeGame(g.scoreA, g.scoreB, rule)
    if (w === 'A') a++
    else if (w === 'B') b++
    if (a >= rule.gamesToWin || b >= rule.gamesToWin) break
  }
  const decided = a >= rule.gamesToWin || b >= rule.gamesToWin
  return {
    winner: decided ? (a > b ? 'A' : 'B') : null,
    gamesWonA: a,
    gamesWonB: b,
    decided,
  }
}

/** まだ入力を受け付けるゲームがあるか。決着後のゲーム欄を畳むために使う。 */
export function remainingGames(games: Game[], rule: ScoringRuleSet): number {
  const j = judgeMatch(games, rule)
  if (j.decided) return 0
  return Math.max(0, rule.gamesPerMatch - games.length)
}

// ---------------------------------------------------------------------------
// 入力補助
// ---------------------------------------------------------------------------

/**
 * 負けた側の点数から、勝った側の点数を推定する。
 *
 * 「9」と打つだけで `15 - 9` が入る挙動（docs/15-ui-ux.md 第2部5）。
 * デュース域に入る値、上限なし、時間制では推定しない（null を返す）。
 */
export function autoCompleteWinnerScore(
  loserScore: number,
  rule: ScoringRuleSet,
): number | null {
  if (rule.winCondition === 'TIME') return null
  const base = rule.pointsPerGame
  if (base === null) return null
  if (loserScore < 0) return null
  // 基準点-1 以上はデュースの可能性があるため補完しない。
  if (loserScore >= base - 1) return null
  return base
}

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

export type ScoreIssueKind =
  | 'NOT_DECIDED'
  | 'OVER_MAX'
  | 'LOSER_AT_OR_ABOVE_BASE'
  | 'TOO_FEW_GAMES'
  | 'EXTRA_GAMES'
  | 'TOO_MANY_GAMES'
  | 'BOTH_ZERO'
  | 'NEGATIVE'

export interface ScoreIssue {
  kind: ScoreIssueKind
  /** 0-based。マッチ全体の指摘なら null。 */
  gameIndex: number | null
  /** 適用中の設定値を必ず添える。「不正な値」とだけ出さない。 */
  message: string
}

/**
 * スコアの妥当性検証。**警告を返すだけで、入力をブロックしない**（UX原則5）。
 * メッセージには必ず適用中の設定値を含める（docs/07 F-5-12）。
 */
export function validateScore(games: Game[], rule: ScoringRuleSet): ScoreIssue[] {
  const issues: ScoreIssue[] = []
  const setting = describeRule(rule)

  games.forEach((g, i) => {
    if (g.scoreA < 0 || g.scoreB < 0) {
      issues.push({ kind: 'NEGATIVE', gameIndex: i, message: `${i + 1}ゲーム目に負の点数が入っています` })
      return
    }
    if (rule.winCondition === 'TIME') {
      if (g.scoreA === 0 && g.scoreB === 0) {
        issues.push({ kind: 'BOTH_ZERO', gameIndex: i, message: `${i + 1}ゲーム目が 0 − 0 です` })
      }
      return
    }
    const base = rule.pointsPerGame
    if (base === null) return
    const hi = Math.max(g.scoreA, g.scoreB)
    const lo = Math.min(g.scoreA, g.scoreB)

    if (rule.maxPoints !== null && hi > rule.maxPoints) {
      issues.push({
        kind: 'OVER_MAX',
        gameIndex: i,
        message: `${i + 1}ゲーム目の ${g.scoreA} − ${g.scoreB} は上限を超えています。${setting}`,
      })
      return
    }
    if (judgeGame(g.scoreA, g.scoreB, rule) === null) {
      issues.push({
        kind: 'NOT_DECIDED',
        gameIndex: i,
        message: `${i + 1}ゲーム目の ${g.scoreA} − ${g.scoreB} は決着していません。${setting}`,
      })
      return
    }
    if (lo >= base && (rule.maxPoints === null || hi < rule.maxPoints)) {
      issues.push({
        kind: 'LOSER_AT_OR_ABOVE_BASE',
        gameIndex: i,
        message: `${i + 1}ゲーム目は負けた側が基準点に達しています。${setting}`,
      })
    }
  })

  if (games.length > rule.gamesPerMatch) {
    issues.push({
      kind: 'TOO_MANY_GAMES',
      gameIndex: null,
      message: `ゲーム数が ${games.length} です。${setting}`,
    })
  }

  const j = judgeMatch(games, rule)
  if (games.length > 0 && !j.decided) {
    issues.push({
      kind: 'TOO_FEW_GAMES',
      gameIndex: null,
      message: `${rule.gamesToWin}ゲーム先取に達していません。${setting}`,
    })
  }

  // 決着後に余分なゲームが入力されている。
  if (j.decided) {
    let need = 0
    let a = 0
    let b = 0
    for (const g of games) {
      need++
      const w = judgeGame(g.scoreA, g.scoreB, rule)
      if (w === 'A') a++
      else if (w === 'B') b++
      if (a >= rule.gamesToWin || b >= rule.gamesToWin) break
    }
    if (games.length > need) {
      issues.push({
        kind: 'EXTRA_GAMES',
        gameIndex: null,
        message: `${need}ゲーム目で決着しています。以降の ${games.length - need} ゲームは不要です`,
      })
    }
  }

  return issues
}

/** 「この種目は15点制（上限21）の設定です」のような説明文。 */
export function describeRule(rule: ScoringRuleSet): string {
  if (rule.winCondition === 'TIME') {
    return `この種目は ${rule.timeLimitMinutes}分1本勝負 の設定です`
  }
  const base = rule.pointsPerGame
  const cap =
    rule.maxPoints === null
      ? '上限なし'
      : rule.twoPointLead
        ? `上限${rule.maxPoints}`
        : '延長なし'
  return `この種目は ${base}点${rule.gamesPerMatch}ゲーム制（${cap}）の設定です`
}

// ---------------------------------------------------------------------------
// 集計の単位
// ---------------------------------------------------------------------------

/**
 * ゲーム率・ポイント率の分母に数えるべき試合か。
 *
 * BYE と NOT_PLAYED は数えない（固定）。docs/05-ranking-engine.md
 */
export function countsTowardRatios(match: Match): boolean {
  if (match.status !== 'COMPLETED') return false
  return match.resultType !== 'BYE' && match.resultType !== 'NOT_PLAYED'
}

/** 勝敗としてカウントすべき試合か。NOT_PLAYED のみ勝者を持たない。 */
export function hasWinner(match: Match): boolean {
  return match.status === 'COMPLETED' && match.resultType !== 'NOT_PLAYED'
}
