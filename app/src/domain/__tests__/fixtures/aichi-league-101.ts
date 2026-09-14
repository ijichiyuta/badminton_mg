// 第101回 愛知県社会人クラブチーム対抗バドミントン選手権大会（前期リーグ戦）男子1部。
//
// 公開されている最終結果から書き起こしたもの。
// https://www.badminton-aichi.com/wp/wp-content/uploads/2026/03/101_result_0627_2.pdf
//
// **団体戦（2複1単）のリーグで、順位決定基準が要項に明記されている。**
// 集計の2階層（Tie ／ Match ／ Game ／ Point）を実データで検証できる貴重な資料。

/** 要項（内規14）の順位決定基準。優先順。 */
export const AICHI_LEAGUE_CRITERIA = [
  '1. 勝敗による',
  '2. マッチ得失率による',
  '3. ゲーム得失率による',
  '4. ポイント得失率による',
  '5. 上記 1〜4 で決まらない場合は当事者同士で勝った方',
] as const

/** 1対戦（Tie）の結果。マッチ数・ゲーム数・ポイント数。 */
export interface TieResult {
  /** 対戦相手のチーム名。 */
  opponent: string
  /** 取得マッチ数 − 失注マッチ数。2複1単なので合計3。 */
  matches: [number, number]
  games: [number, number]
  points: [number, number]
}

export interface LeagueTeam {
  name: string
  ties: TieResult[]
  /** 公表されている集計値。 */
  totalMatches: [number, number]
  totalGames: [number, number]
  totalPoints: [number, number]
  /** 公表されている最終順位。 */
  rank: number
}

/**
 * 男子1部。6チーム総当たり。
 *
 * 各チーム5対戦 × 3マッチ = 15マッチ。`totalMatches` の和が15になる。
 */
export const AICHI_M1: LeagueTeam[] = [
  {
    name: 'はりーあっぷ(A)',
    ties: [
      { opponent: 'FLIGHT', matches: [3, 0], games: [6, 1], points: [135, 102] },
      { opponent: '紫電会', matches: [2, 1], games: [5, 2], points: [137, 125] },
      { opponent: 'WISTARIA(A)', matches: [2, 1], games: [4, 2], points: [123, 95] },
      { opponent: 'RHBT(A)', matches: [3, 0], games: [6, 2], points: [149, 131] },
      { opponent: 'RS NOANAKA(A)', matches: [2, 1], games: [5, 3], points: [159, 113] },
    ],
    totalMatches: [12, 3],
    totalGames: [26, 10],
    totalPoints: [703, 566],
    rank: 1,
  },
  {
    name: 'FLIGHT',
    ties: [
      { opponent: 'はりーあっぷ(A)', matches: [0, 3], games: [1, 6], points: [102, 135] },
      { opponent: '紫電会', matches: [1, 2], games: [2, 4], points: [79, 121] },
      { opponent: 'WISTARIA(A)', matches: [2, 1], games: [4, 2], points: [108, 93] },
      { opponent: 'RHBT(A)', matches: [2, 1], games: [5, 2], points: [144, 130] },
      { opponent: 'RS NOANAKA(A)', matches: [1, 2], games: [3, 4], points: [107, 135] },
    ],
    totalMatches: [6, 9],
    totalGames: [15, 18],
    totalPoints: [540, 614],
    rank: 4,
  },
  {
    name: '紫電会',
    ties: [
      { opponent: 'はりーあっぷ(A)', matches: [1, 2], games: [2, 5], points: [125, 137] },
      { opponent: 'FLIGHT', matches: [2, 1], games: [4, 2], points: [121, 79] },
      { opponent: 'WISTARIA(A)', matches: [3, 0], games: [6, 2], points: [165, 135] },
      { opponent: 'RHBT(A)', matches: [2, 1], games: [4, 2], points: [129, 114] },
      { opponent: 'RS NOANAKA(A)', matches: [2, 1], games: [4, 2], points: [113, 93] },
    ],
    totalMatches: [10, 5],
    totalGames: [20, 13],
    totalPoints: [653, 558],
    rank: 2,
  },
  {
    name: 'RS NOANAKA(A)',
    ties: [
      { opponent: 'はりーあっぷ(A)', matches: [1, 2], games: [3, 5], points: [113, 159] },
      { opponent: 'FLIGHT', matches: [2, 1], games: [4, 3], points: [135, 107] },
      { opponent: '紫電会', matches: [1, 2], games: [2, 4], points: [93, 113] },
      { opponent: 'WISTARIA(A)', matches: [3, 0], games: [6, 1], points: [148, 122] },
      { opponent: 'RHBT(A)', matches: [1, 2], games: [2, 4], points: [97, 105] },
    ],
    totalMatches: [8, 7],
    totalGames: [17, 17],
    totalPoints: [586, 606],
    rank: 3,
  },
  {
    name: 'RHBT(A)',
    ties: [
      { opponent: 'はりーあっぷ(A)', matches: [0, 3], games: [2, 6], points: [131, 149] },
      { opponent: 'FLIGHT', matches: [1, 2], games: [2, 5], points: [130, 144] },
      { opponent: '紫電会', matches: [1, 2], games: [2, 4], points: [114, 129] },
      { opponent: 'WISTARIA(A)', matches: [1, 2], games: [4, 4], points: [146, 144] },
      { opponent: 'RS NOANAKA(A)', matches: [2, 1], games: [4, 2], points: [105, 97] },
    ],
    totalMatches: [5, 10],
    totalGames: [14, 21],
    totalPoints: [626, 663],
    rank: 5,
  },
  {
    name: 'WISTARIA(A)',
    ties: [
      { opponent: 'はりーあっぷ(A)', matches: [1, 2], games: [2, 4], points: [95, 123] },
      { opponent: 'FLIGHT', matches: [1, 2], games: [2, 4], points: [93, 108] },
      { opponent: '紫電会', matches: [0, 3], games: [2, 6], points: [135, 165] },
      { opponent: 'RHBT(A)', matches: [2, 1], games: [4, 4], points: [144, 146] },
      { opponent: 'RS NOANAKA(A)', matches: [0, 3], games: [1, 6], points: [122, 148] },
    ],
    totalMatches: [4, 11],
    totalGames: [11, 24],
    totalPoints: [589, 690],
    rank: 6,
  },
]

export const AICHI_SETUP = {
  tournament: '第101回愛知県社会人クラブチーム対抗バドミントン選手権大会（前期リーグ戦）',
  organizer: '愛知県バドミントン協会、愛知県社会人クラブバドミントン連盟',
  /** 男女とも2複1単。複・単・複の順。 */
  format: '2D1S',
  matchesPerTie: 3,
  /** 各部は原則6チーム編成。 */
  teamsPerGroup: 6,
  /** 審判は対戦チームから出す（相互審判）。 */
  referee: 'MUTUAL',
}
