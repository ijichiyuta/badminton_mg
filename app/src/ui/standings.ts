// 星取表のマス1つ分の判定。
//
// **個人戦と団体戦で数える単位が違う。**
// 個人戦は1マス＝1試合でゲーム数を出す。団体戦は1マス＝1対戦で、取ったマッチ数を出す。
// この分岐を画面の中に埋めると検証できないので、ここに出してある。

import type { MatchRecord } from '../store/schema'

export interface CellView {
  /** マスの左上に出す番号を持つ試合。 */
  head: MatchRecord
  /** タップしたときに開く試合。未入力があればそれ。 */
  open: MatchRecord
  /** 結果が出ているか。相手が決まっていない枠は「出ていない」。 */
  done: boolean
  /** 行側（a）が勝ったか。 */
  won: boolean
  /** 「2-1」の形。個人戦はゲーム数、団体戦はマッチ数。 */
  score: string | null
  /** 過半数に達したが、まだ消化していない試合が残っている状態。 */
  decidedEarly: boolean
}

/** a と b の対戦に属する試合を集める。団体戦では複数返る。 */
export function cellMatches(matches: MatchRecord[], a: string, b: string): MatchRecord[] {
  return matches.filter(
    (m) =>
      (m.entryIds[0] === a && m.entryIds[1] === b) || (m.entryIds[0] === b && m.entryIds[1] === a),
  )
}

export function cellView(matches: MatchRecord[], a: string, b: string): CellView | null {
  const ms = cellMatches(matches, a, b)
  if (ms.length === 0) return null

  const head = ms[0]
  const isTie = head.tieId !== null && ms.length > 1

  if (!isTie) {
    const m = head
    const mine = m.entryIds[0] === a ? 0 : 1
    let score: string | null = null
    if (m.status === 'COMPLETED' && m.games.length > 0) {
      let w = 0
      let l = 0
      for (const g of m.games) {
        const my = mine === 0 ? g.scoreA : g.scoreB
        const th = mine === 0 ? g.scoreB : g.scoreA
        if (my > th) w++
        else if (th > my) l++
      }
      score = `${w}-${l}`
    }
    return {
      head: m,
      open: m,
      done: m.status === 'COMPLETED',
      won: m.winnerEntryId === a,
      score,
      decidedEarly: false,
    }
  }

  // 団体戦。取ったマッチ数で数える。
  const won = ms.filter((m) => m.winnerEntryId === a).length
  const lost = ms.filter((m) => m.winnerEntryId === b).length
  const need = Math.floor(ms.length / 2) + 1
  const decided = won >= need || lost >= need
  const allDone = ms.every((m) => m.status === 'COMPLETED')
  return {
    head,
    // 未消化があればそこを開く。全部終わっていれば先頭に戻る。
    open: ms.find((m) => m.status !== 'COMPLETED') ?? ms[0],
    done: decided || allDone,
    won: won > lost,
    score: won + lost > 0 ? `${won}-${lost}` : null,
    decidedEarly: decided && !allDone,
  }
}
