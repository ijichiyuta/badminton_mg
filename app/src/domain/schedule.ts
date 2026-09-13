// タイムテーブル生成と試合番号の採番。docs/17-first-customer.md / docs/04-formats.md
//
// 現行のタイムテーブルは 6コート × 30分刻みで、全ブロックを同じペースで回す。
// 1ラウンドで各ブロックの①②、次のラウンドで③④…と並べる。
//
//        1コート   2コート   3コート   4コート   5コート   6コート
// 9:30      1        2        3        4        5        6
//        男3部1①  男3部1②  女3部1①  女3部1②  女3部2①  女3部2②
// 10:00     7        8        9       10       11       12
//
// 通し試合番号（1, 2, 3…）は「大会全体」で振る。星取表のマスには
// ブロック内番号（①②③…）と通し番号の両方が入る。

import { type Pairing, roundRobinPairings, roundsOf, type PairingStyle } from './draw'

/** スケジュールの対象となる1ブロック。 */
export interface ScheduleBlock {
  /** 表示名。「男子3部 1ブロック」など。 */
  id: string
  label: string
  /** ブロック内のエントリーID。並び順が星取表の行番号（1-based）になる。 */
  entryIds: string[]
  /** このブロックに適用する採点方式。 */
  scoringRuleId: string | null
}

/** 採番された1試合。 */
export interface ScheduledMatch {
  blockId: string
  blockLabel: string
  /** ブロック内の試合順（1-based）。星取表の丸数字。 */
  numberInGroup: number
  /** 大会全体の通し試合番号（1-based）。 */
  number: number
  /** 対戦するエントリーID。 */
  entryIds: [string, string]
  /** 星取表の行番号（1-based）の組。 */
  slotPair: Pairing
  /** ブロック内の何ラウンド目か（1-based）。 */
  round: number
  /** 1-based のコート番号。 */
  court: number
  /** 開始予定時刻。「目安」であり約束ではない。 */
  scheduledAt: string
  scoringRuleId: string | null
}

export interface ScheduleOptions {
  /** コート数。第1号提供先は6面。 */
  courtCount: number
  /** 開始時刻。`HH:MM`。 */
  startTime: string
  /** 1枠の長さ（分）。第1号提供先は30分。 */
  slotMinutes: number
  /** 1ラウンドで同時に流すブロック内試合数。既定2（①②を2コートで同時進行）。 */
  matchesPerRoundPerBlock?: number
  pairingStyle?: PairingStyle
}

function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) throw new Error(`時刻の書式が不正です: ${hhmm}`)
  return Number(m[1]) * 60 + Number(m[2])
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 全ブロックの試合を採番し、コートと時刻に割り当てる。
 *
 * ラウンド優先で並べる。全ブロックが①②を消化してから③④へ進む。
 * これは現行のタイムテーブルの並びと同じ。
 */
export function buildSchedule(blocks: ScheduleBlock[], opts: ScheduleOptions): ScheduledMatch[] {
  const perRound = opts.matchesPerRoundPerBlock ?? 2
  const style = opts.pairingStyle ?? 'njsf'

  // ブロックごとに対戦順を出し、ラウンドに切る。
  const byBlock = blocks.map((b) => {
    const pairings = roundRobinPairings(b.entryIds.length, style)
    return { block: b, rounds: roundsOf(pairings, perRound), pairings }
  })
  const maxRounds = Math.max(0, ...byBlock.map((x) => x.rounds.length))

  // ラウンド優先で1列に並べる。
  const flat: { block: ScheduleBlock; pair: Pairing; numberInGroup: number; round: number }[] = []
  for (let r = 0; r < maxRounds; r++) {
    for (const { block, rounds } of byBlock) {
      const round = rounds[r]
      if (!round) continue
      round.forEach((pair, i) => {
        flat.push({ block, pair, numberInGroup: r * perRound + i + 1, round: r + 1 })
      })
    }
  }

  // コートと時刻に詰める。
  const start = parseTime(opts.startTime)
  return flat.map((x, idx) => {
    const slot = Math.floor(idx / opts.courtCount)
    const court = (idx % opts.courtCount) + 1
    const [a, b] = x.pair
    return {
      blockId: x.block.id,
      blockLabel: x.block.label,
      numberInGroup: x.numberInGroup,
      number: idx + 1,
      entryIds: [x.block.entryIds[a - 1], x.block.entryIds[b - 1]],
      slotPair: x.pair,
      round: x.round,
      court,
      scheduledAt: formatTime(start + slot * opts.slotMinutes),
      scoringRuleId: x.block.scoringRuleId,
    }
  })
}

// ---------------------------------------------------------------------------
// タイムテーブル表示
// ---------------------------------------------------------------------------

export interface TimetableCell {
  match: ScheduledMatch | null
}

export interface TimetableRow {
  time: string
  cells: TimetableCell[]
}

/** コート × 時刻のグリッドに並べ替える。印刷と画面の両方で使う。 */
export function toTimetable(matches: ScheduledMatch[], courtCount: number): TimetableRow[] {
  const byTime = new Map<string, ScheduledMatch[]>()
  for (const m of matches) {
    const arr = byTime.get(m.scheduledAt)
    if (arr) arr.push(m)
    else byTime.set(m.scheduledAt, [m])
  }
  return [...byTime.entries()]
    .sort((a, b) => parseTime(a[0]) - parseTime(b[0]))
    .map(([time, ms]) => ({
      time,
      cells: Array.from({ length: courtCount }, (_, i) => ({
        match: ms.find((m) => m.court === i + 1) ?? null,
      })),
    }))
}

// ---------------------------------------------------------------------------
// 審判の割当
// ---------------------------------------------------------------------------

export type RefereeStyle = 'LOSER' | 'MUTUAL' | 'NONE'

export interface RefereeAssignment {
  /** 通し試合番号。 */
  matchNumber: number
  /** 審判を出す試合の通し番号。null なら未確定。 */
  fromMatchNumber: number | null
  /** 説明文。タイムテーブルとスコアシートに印字する。 */
  note: string
}

export interface RefereeOptions {
  style: RefereeStyle
  /**
   * 第1試合の審判を「タイムテーブルの何段目の選手」に頼むか。
   * 第1号提供先の要項は3段目。
   */
  firstMatchRefereeOffsetRows: number
  courtCount: number
}

/**
 * 審判の割当。第1号提供先では要項でルール化されている。
 *
 * > ① 第一試合の審判はタイムテーブル3段目の選手でお願いします。
 * > ② 敗者審を原則とします。（敗者2名、勝者1名は線審を担当）
 *
 * 1人運用では「次の審判は誰？」が中断要因になる。紙に印字しておけば聞かれる回数が減る。
 */
export function assignReferees(
  matches: ScheduledMatch[],
  opts: RefereeOptions,
): RefereeAssignment[] {
  if (opts.style === 'NONE') {
    return matches.map((m) => ({ matchNumber: m.number, fromMatchNumber: null, note: '' }))
  }

  const rows = opts.courtCount
  const firstSlotCount = rows // 最初の1枠分の試合数

  return matches.map((m, idx) => {
    if (opts.style === 'MUTUAL') {
      return { matchNumber: m.number, fromMatchNumber: null, note: '相互審判' }
    }
    // 最初の枠の試合には敗者がまだいない。N段目の試合の選手に頼む。
    if (idx < firstSlotCount) {
      const target = idx + opts.firstMatchRefereeOffsetRows * rows
      const from = matches[target]
      return {
        matchNumber: m.number,
        fromMatchNumber: from ? from.number : null,
        note: from
          ? `タイムテーブル${opts.firstMatchRefereeOffsetRows}段目（第${from.number}試合）の選手`
          : `タイムテーブル${opts.firstMatchRefereeOffsetRows}段目の選手`,
      }
    }
    // 以降は敗者審。同じコートの1つ前の試合の敗者2名＋勝者1名。
    const prev = matches[idx - rows]
    return {
      matchNumber: m.number,
      fromMatchNumber: prev ? prev.number : null,
      note: prev ? `第${prev.number}試合の敗者2名（主審・副審）と勝者1名（線審）` : '敗者審',
    }
  })
}

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

export type ScheduleIssueKind = 'DOUBLE_BOOKED' | 'BACK_TO_BACK' | 'REFEREE_CONFLICT'

export interface ScheduleIssue {
  kind: ScheduleIssueKind
  detail: string
  matchNumbers: number[]
}

/**
 * タイムテーブルの検証。**警告のみ。進行はブロックしない**（UX原則5）。
 *
 * 「タイムテーブルは目安です」と要項に明記されている以上、
 * 厳密さを理由に進行を止めてはならない。
 */
export function validateSchedule(
  matches: ScheduledMatch[],
  opts: { minIntervalSlots?: number } = {},
): ScheduleIssue[] {
  const issues: ScheduleIssue[] = []

  // 同一エントリーが同時刻に2コートへ割り当てられていないか（不変条件1）。
  const bySlot = new Map<string, ScheduledMatch[]>()
  for (const m of matches) {
    const arr = bySlot.get(m.scheduledAt)
    if (arr) arr.push(m)
    else bySlot.set(m.scheduledAt, [m])
  }
  for (const [time, ms] of bySlot) {
    const seen = new Map<string, number>()
    for (const m of ms) {
      for (const e of m.entryIds) {
        const prev = seen.get(e)
        if (prev !== undefined) {
          issues.push({
            kind: 'DOUBLE_BOOKED',
            detail: `${time} に同じエントリーが2コートへ割り当てられています`,
            matchNumbers: [prev, m.number],
          })
        } else {
          seen.set(e, m.number)
        }
      }
    }
  }

  // 連続試合。既定では警告しない（1枠空けを求める設定のときだけ）。
  const minGap = opts.minIntervalSlots ?? 0
  if (minGap > 0) {
    const lastSlot = new Map<string, { slot: number; number: number }>()
    const slots = [...bySlot.keys()].sort((a, b) => parseTime(a) - parseTime(b))
    const slotIndex = new Map(slots.map((t, i) => [t, i]))
    for (const m of matches) {
      const si = slotIndex.get(m.scheduledAt) ?? 0
      for (const e of m.entryIds) {
        const prev = lastSlot.get(e)
        if (prev && si - prev.slot <= minGap) {
          issues.push({
            kind: 'BACK_TO_BACK',
            detail: `連続する試合の間隔が ${minGap} 枠未満です`,
            matchNumbers: [prev.number, m.number],
          })
        }
        lastSlot.set(e, { slot: si, number: m.number })
      }
    }
  }

  return issues
}

/** 大会全体の試合数と所要枠数。規模の見積もりに使う。 */
export function scheduleSummary(matches: ScheduledMatch[], courtCount: number) {
  const slots = new Set(matches.map((m) => m.scheduledAt))
  return {
    matchCount: matches.length,
    slotCount: slots.size,
    courtCount,
    firstTime: matches.length > 0 ? matches[0].scheduledAt : null,
    lastTime: matches.length > 0 ? matches[matches.length - 1].scheduledAt : null,
  }
}
