// スコアシートの版組。docs/17-first-customer.md / 記入例の構造に合わせる。
//
// フルグリッド版。公式のスコアシートと同じく、ラリーごとに1列を使う。
//
//   ・4行（ダブルスは2名×2ペア）
//   ・1列に1つだけ数字を書く
//   ・書く行は「次にサーブを打つ選手」の行
//   ・最初は両方に 0
//   ・ゲームごとに行ブロックを改める
//
// ここから重要な性質が出る。**各サイドの数列は 0 から最終得点までの連番になる。**
// 書かれている数字そのものは情報を持たず、「どの行に印があるか」だけで得点経過が復元できる。
// 将来の写真読み取りはこの性質を使う。

import type { ScoringRuleSet } from '../domain/types'

/**
 * 1ゲームぶんのグリッドに必要な列数。
 *
 * 公式フォーマット（A4横）は **42マス／段**で、15点制・21点制のどちらも
 * これで足りる設計になっている。上限の高い設定でだけ必要数まで増やす。
 */
export const OFFICIAL_COLUMNS = 42

export function columnsPerGame(rule: ScoringRuleSet): number {
  if (rule.winCondition === 'TIME') return OFFICIAL_COLUMNS
  const base = rule.pointsPerGame ?? 0
  // 最大ラリー数＝両者の最終得点の和。上限があればそれで決まる。
  const cap = rule.maxPoints ?? base * 2
  const needed = cap + (cap - 1) + 1 // 先頭の 0 のぶん
  return Math.max(OFFICIAL_COLUMNS, needed)
}

/** 行の見出し。ダブルスは4行、シングルスは2行。 */
export interface SheetRow {
  /** 表示名。 */
  name: string
  affiliation: string
  /** 上2行が A サイド、下2行が B サイド。 */
  side: 'A' | 'B'
  /** サーバー／レシーバーの記入欄に入れる初期値。空欄にして手書きさせる。 */
  marker: string
}

export interface Scoresheet {
  /** 大会全体の通し試合番号。 */
  number: number | null
  /** ブロック内の試合順。 */
  numberInGroup: number | null
  tournamentName: string
  date: string
  venue: string
  eventName: string
  blockName: string
  courtName: string
  scheduledAt: string
  rows: SheetRow[]
  /** ゲームごとのグリッド。ゲーム数ぶん。 */
  games: { columns: number }[]
  /** デュースに入る点。20点オールで斜め線を入れる運用のため。 */
  deuceFrom: number | null
  ruleLabel: string
  /** 審判の割当。「第12試合の敗者2名」など。 */
  refereeNote: string
  /** スマホで読むとこの試合の入力画面が開く。 */
  qrPayload: string
}

export interface BuildSheetInput {
  number: number | null
  numberInGroup: number | null
  tournamentName: string
  date: string
  venue: string
  eventName: string
  blockName: string
  courtName: string
  scheduledAt: string
  /** A サイドの選手名（ダブルスなら2名）。 */
  sideA: { names: string[]; affiliation: string }
  sideB: { names: string[]; affiliation: string }
  rule: ScoringRuleSet
  ruleLabel: string
  refereeNote: string
  /** 入力画面へ飛ぶ URL。QR に載せる。 */
  inputUrl: string
}

export function buildScoresheet(input: BuildSheetInput): Scoresheet {
  const rows: SheetRow[] = []
  // 記入例と同じ並び。上2行が A サイド、下2行が B サイド。
  for (const n of input.sideA.names) {
    rows.push({ name: n, affiliation: input.sideA.affiliation, side: 'A', marker: '' })
  }
  for (const n of input.sideB.names) {
    rows.push({ name: n, affiliation: input.sideB.affiliation, side: 'B', marker: '' })
  }

  const cols = columnsPerGame(input.rule)
  return {
    number: input.number,
    numberInGroup: input.numberInGroup,
    tournamentName: input.tournamentName,
    date: input.date,
    venue: input.venue,
    eventName: input.eventName,
    blockName: input.blockName,
    courtName: input.courtName,
    scheduledAt: input.scheduledAt,
    rows,
    games: Array.from({ length: input.rule.gamesPerMatch }, () => ({ columns: cols })),
    deuceFrom: input.rule.deuceFrom,
    ruleLabel: input.ruleLabel,
    refereeNote: input.refereeNote,
    qrPayload: input.inputUrl,
  }
}

// ---------------------------------------------------------------------------
// QR コード（外部ライブラリを使わない最小実装）
// ---------------------------------------------------------------------------

/**
 * QR は外部ライブラリを足さずに済ませたいが、自前実装は誤りが入りやすい。
 * v1 では**試合番号を大きく印字するだけ**にして、QR は後回しにする。
 *
 * 旧サービスはバーコードを印字して WEB カメラで読んでいる。
 * 同等の体験は「試合番号を打つ」で足りており、実装の危険を先に取る理由がない。
 */
export const QR_DEFERRED = true
