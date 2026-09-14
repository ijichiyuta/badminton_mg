// 第64回 愛知県スポーツ祭典 バドミントン大会（2026-09-06）の実データ。
//
// 公開されている組合せ表・タイムテーブルから機械的に書き起こしたもの。
// https://aichi-bad.njsf.net/wp-content/uploads/2026/09/2026-0906draw2.pdf
//
// **これが受け入れテストの正解データ。** 個人名は含めない（構造だけで検証できる）。

/** ブロック。現行の並び順のまま。 */
export interface RealBlock {
  label: string
  /** チーム数。4が基本で、申込状況により5が混ざる。 */
  teams: number
}

/**
 * タイムテーブルに現れる順のブロック一覧。
 *
 * **5チームのブロックが先に並んでいる。** 試合数が多いぶん早く始めないと終わらないため。
 */
export const REAL_BLOCKS: RealBlock[] = [
  { label: '男子3部1', teams: 5 },
  { label: '女子3部1', teams: 5 },
  { label: '女子3部2', teams: 5 },
  { label: '女子3部3', teams: 5 },
  { label: '男子1部', teams: 4 },
  { label: '男子2部1', teams: 4 },
  { label: '男子2部2', teams: 4 },
  { label: '男子2部3', teams: 4 },
  { label: '男子3部2', teams: 4 },
  { label: '男子3部3', teams: 4 },
  { label: '男子3部4', teams: 4 },
  { label: '女子2部1', teams: 4 },
  { label: '女子2部2', teams: 4 },
]

/** 1試合分。通し番号・ブロック・ブロック内番号。 */
export interface RealMatch {
  number: number
  block: string
  numberInGroup: number
}

/**
 * 実際のタイムテーブル。94試合。
 *
 * コートは `((number - 1) % 6) + 1`、時刻は 9:30 から30分刻みで
 * `floor((number - 1) / 6)` 枠目。全行でこの規則が成り立っている。
 */
export const REAL_TIMETABLE: RealMatch[] = [
  // 9:30
  { number: 1, block: '男子3部1', numberInGroup: 1 },
  { number: 2, block: '男子3部1', numberInGroup: 2 },
  { number: 3, block: '女子3部1', numberInGroup: 1 },
  { number: 4, block: '女子3部1', numberInGroup: 2 },
  { number: 5, block: '女子3部2', numberInGroup: 1 },
  { number: 6, block: '女子3部2', numberInGroup: 2 },
  // 10:00
  { number: 7, block: '女子3部3', numberInGroup: 1 },
  { number: 8, block: '女子3部3', numberInGroup: 2 },
  { number: 9, block: '男子1部', numberInGroup: 1 },
  { number: 10, block: '男子1部', numberInGroup: 2 },
  { number: 11, block: '男子2部1', numberInGroup: 1 },
  { number: 12, block: '男子2部1', numberInGroup: 2 },
  // 10:30
  { number: 13, block: '男子2部2', numberInGroup: 1 },
  { number: 14, block: '男子2部2', numberInGroup: 2 },
  { number: 15, block: '男子2部3', numberInGroup: 1 },
  { number: 16, block: '男子2部3', numberInGroup: 2 },
  { number: 17, block: '男子3部2', numberInGroup: 1 },
  { number: 18, block: '男子3部2', numberInGroup: 2 },
  // 11:00
  { number: 19, block: '男子3部3', numberInGroup: 1 },
  { number: 20, block: '男子3部3', numberInGroup: 2 },
  { number: 21, block: '男子3部4', numberInGroup: 1 },
  { number: 22, block: '男子3部4', numberInGroup: 2 },
  { number: 23, block: '女子2部1', numberInGroup: 1 },
  { number: 24, block: '女子2部1', numberInGroup: 2 },
  // 11:30
  { number: 25, block: '女子2部2', numberInGroup: 1 },
  { number: 26, block: '女子2部2', numberInGroup: 2 },
  { number: 27, block: '男子3部1', numberInGroup: 3 },
  { number: 28, block: '男子3部1', numberInGroup: 4 },
  { number: 29, block: '女子3部1', numberInGroup: 3 },
  { number: 30, block: '女子3部1', numberInGroup: 4 },
  // 12:00
  { number: 31, block: '女子3部2', numberInGroup: 3 },
  { number: 32, block: '女子3部2', numberInGroup: 4 },
  { number: 33, block: '女子3部3', numberInGroup: 3 },
  { number: 34, block: '女子3部3', numberInGroup: 4 },
  { number: 35, block: '男子1部', numberInGroup: 3 },
  { number: 36, block: '男子1部', numberInGroup: 4 },
  // 12:30
  { number: 37, block: '男子2部1', numberInGroup: 3 },
  { number: 38, block: '男子2部1', numberInGroup: 4 },
  { number: 39, block: '男子2部2', numberInGroup: 3 },
  { number: 40, block: '男子2部2', numberInGroup: 4 },
  { number: 41, block: '男子2部3', numberInGroup: 3 },
  { number: 42, block: '男子2部3', numberInGroup: 4 },
  // 13:00
  { number: 43, block: '男子3部2', numberInGroup: 3 },
  { number: 44, block: '男子3部2', numberInGroup: 4 },
  { number: 45, block: '男子3部3', numberInGroup: 3 },
  { number: 46, block: '男子3部3', numberInGroup: 4 },
  { number: 47, block: '男子3部4', numberInGroup: 3 },
  { number: 48, block: '男子3部4', numberInGroup: 4 },
  // 13:30
  { number: 49, block: '女子2部1', numberInGroup: 3 },
  { number: 50, block: '女子2部1', numberInGroup: 4 },
  { number: 51, block: '女子2部2', numberInGroup: 3 },
  { number: 52, block: '女子2部2', numberInGroup: 4 },
  { number: 53, block: '男子3部1', numberInGroup: 5 },
  { number: 54, block: '男子3部1', numberInGroup: 6 },
  // 14:00
  { number: 55, block: '女子3部1', numberInGroup: 5 },
  { number: 56, block: '女子3部1', numberInGroup: 6 },
  { number: 57, block: '女子3部2', numberInGroup: 5 },
  { number: 58, block: '女子3部2', numberInGroup: 6 },
  { number: 59, block: '女子3部3', numberInGroup: 5 },
  { number: 60, block: '女子3部3', numberInGroup: 6 },
  // 14:30
  { number: 61, block: '男子1部', numberInGroup: 5 },
  { number: 62, block: '男子1部', numberInGroup: 6 },
  { number: 63, block: '男子2部1', numberInGroup: 5 },
  { number: 64, block: '男子2部1', numberInGroup: 6 },
  { number: 65, block: '男子2部2', numberInGroup: 5 },
  { number: 66, block: '男子2部2', numberInGroup: 6 },
  // 15:00
  { number: 67, block: '男子2部3', numberInGroup: 5 },
  { number: 68, block: '男子2部3', numberInGroup: 6 },
  { number: 69, block: '男子3部1', numberInGroup: 7 },
  { number: 70, block: '男子3部1', numberInGroup: 8 },
  { number: 71, block: '女子3部1', numberInGroup: 7 },
  { number: 72, block: '女子3部1', numberInGroup: 8 },
  // 15:30
  { number: 73, block: '女子3部2', numberInGroup: 7 },
  { number: 74, block: '女子3部2', numberInGroup: 8 },
  { number: 75, block: '女子3部3', numberInGroup: 7 },
  { number: 76, block: '女子3部3', numberInGroup: 8 },
  { number: 77, block: '男子3部2', numberInGroup: 5 },
  { number: 78, block: '男子3部2', numberInGroup: 6 },
  // 16:00
  { number: 79, block: '男子3部3', numberInGroup: 5 },
  { number: 80, block: '男子3部3', numberInGroup: 6 },
  { number: 81, block: '男子3部4', numberInGroup: 5 },
  { number: 82, block: '男子3部4', numberInGroup: 6 },
  { number: 83, block: '女子2部1', numberInGroup: 5 },
  { number: 84, block: '女子2部1', numberInGroup: 6 },
  // 16:30
  { number: 85, block: '女子2部2', numberInGroup: 5 },
  { number: 86, block: '女子2部2', numberInGroup: 6 },
  { number: 87, block: '男子3部1', numberInGroup: 9 },
  { number: 88, block: '男子3部1', numberInGroup: 10 },
  { number: 89, block: '女子3部1', numberInGroup: 9 },
  { number: 90, block: '女子3部1', numberInGroup: 10 },
  // 17:00
  { number: 91, block: '女子3部2', numberInGroup: 9 },
  { number: 92, block: '女子3部2', numberInGroup: 10 },
  { number: 93, block: '女子3部3', numberInGroup: 9 },
  { number: 94, block: '女子3部3', numberInGroup: 10 },
]

/** 男子1部の星取表。マス内の通し番号（上三角）。実物から書き起こし。 */
export const REAL_M1_UPPER: Record<string, number> = {
  '1-2': 9,
  '1-3': 35,
  '1-4': 61,
  '2-3': 62,
  '2-4': 36,
  '3-4': 10,
}

/** 同じく丸数字（下三角）。 */
export const REAL_M1_CIRCLED: Record<string, number> = {
  '1-2': 1,
  '1-3': 3,
  '1-4': 5,
  '2-3': 6,
  '2-4': 4,
  '3-4': 2,
}

export const REAL_SETUP = {
  date: '2026-09-06',
  venue: '昭和スポーツセンター',
  courtCount: 6,
  startTime: '9:30',
  slotMinutes: 30,
  /** 要項・組合せ表の記載どおり。4チームリーグは上限17。 */
  scoringPresetId: '15pt-3g-cap17',
  /** 5チームリーグは「打ち切り」＝延長なし。 */
  scoringPresetIdFor5: '15pt-3g-nodeuce',
  totalEntries: 56,
  totalMatches: 94,
  /** 第一試合の審判はタイムテーブル3段目のペア。 */
  firstMatchRefereeRow: 3,
}
