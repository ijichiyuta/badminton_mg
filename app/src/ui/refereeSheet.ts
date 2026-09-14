// 団体戦の審判用紙。
//
// **愛知県バドミントン協会が実際に使っている用紙に合わせる。**
// 名前が「スコアシート」ではなく「審判用紙」であることも含めて、現場の呼び方に寄せる。
//
// 大会プログラム（第101回）に運用が書かれている。
//
//   ・チームはクラウドオーダーシステムでオーダーを提出する
//   ・**本部が、オーダーを刷り込んだ審判用紙を出力して配る**
//   ・試合開始前、主審が対戦相手を読み上げ、用紙のオーダーと提出内容が一致するか照合する
//   ・試合後、**敗者チームが**審判用紙とシャトルを本部へ届ける
//
// 右上の記入欄は、実際に使っている方から聞いた構成。
// **欄はあるが、ほとんど主審とシャトル数しか書かれない。**
// だから欄は残すが、埋まっていないことを異常として扱わない。

import type { LineupSlot } from '../domain/types'

/** 右上の記入欄。左から並ぶ順。 */
export const REFEREE_FIELDS = [
  { key: 'start', label: '開始時間', width: 'wide' },
  { key: 'end', label: '終了時間', width: 'wide' },
  { key: 'shuttles', label: 'シャトル数', width: 'narrow' },
  { key: 'umpire', label: '主審', width: 'wide' },
  { key: 'service', label: 'サービスジャッジ', width: 'wide' },
  { key: 'line', label: '線審', width: 'wide' },
] as const

/** 実際に書かれることが多い欄。印刷では少しだけ広く取る。 */
export const OFTEN_FILLED: readonly string[] = ['umpire', 'shuttles']

export interface RefereeSheetSide {
  teamName: string
  /** 枠ごとの出場者。オーダー未提出なら空配列。 */
  players: string[][]
}

export interface RefereeSheet {
  tournamentName: string
  date: string
  venue: string
  eventName: string
  blockName: string
  /** 対戦の通し番号。用紙を探すときの手がかりになる。 */
  tieNumber: number | null
  courtName: string
  scheduledAt: string
  ruleLabel: string
  slots: LineupSlot[]
  a: RefereeSheetSide
  b: RefereeSheetSide
  /** 1ゲームぶんのマス数。スコアシートと同じ計算を使う。 */
  columnsPerGame: number
  gamesPerMatch: number
  deuceFrom: number | null
}

export interface BuildRefereeSheetInput extends Omit<RefereeSheet, 'a' | 'b'> {
  a: RefereeSheetSide
  b: RefereeSheetSide
}

export function buildRefereeSheet(input: BuildRefereeSheetInput): RefereeSheet {
  // 枠の数だけ選手欄を用意する。オーダーが未提出でも行は出す。
  // **空欄の行があること自体が「まだ出ていない」という情報になる。**
  const fill = (side: RefereeSheetSide): RefereeSheetSide => ({
    teamName: side.teamName,
    players: input.slots.map((_, i) => side.players[i] ?? []),
  })
  return { ...input, a: fill(input.a), b: fill(input.b) }
}
