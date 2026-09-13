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
  /**
   * 1ラウンドで同時に流すブロック内試合数。
   * 省略時は `floor(チーム数 / 2)`。4・5チームなら2、3チームなら1。
   * **固定値にしてはならない。** 3チームブロックで同じ選手が2コートに出てしまう。
   */
  matchesPerRoundPerBlock?: number
  pairingStyle?: PairingStyle
}

function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) throw new Error(`時刻の書式が不正です: ${hhmm}`)
  const h = Number(m[1])
  const min = Number(m[2])
  // 正規表現だけでは 9:75 や 99:00 を通してしまう。9:75 が黙って 10:15 になる。
  if (h > 23) throw new Error(`時が範囲外です: ${hhmm}`)
  if (min > 59) throw new Error(`分が範囲外です: ${hhmm}`)
  return h * 60 + min
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
  if (!Number.isInteger(opts.courtCount) || opts.courtCount < 1) {
    throw new Error(`コート数は1以上の整数である必要があります: ${opts.courtCount}`)
  }
  if (!Number.isFinite(opts.slotMinutes) || opts.slotMinutes <= 0) {
    throw new Error(`1枠の長さは正の数である必要があります: ${opts.slotMinutes}`)
  }
  const style = opts.pairingStyle ?? 'njsf'

  // ブロックごとに対戦順を出し、ラウンドに切る。
  // 同時に流せる試合数はブロックのチーム数で決まる。3チームなら1試合ずつ。
  const byBlock = blocks.map((b) => {
    const n = b.entryIds.length
    const perRound = opts.matchesPerRoundPerBlock ?? Math.max(1, Math.floor(n / 2))
    const pairings = roundRobinPairings(n, style)
    return { block: b, perRound, rounds: roundsOf(pairings, perRound) }
  })
  const maxRounds = Math.max(0, ...byBlock.map((x) => x.rounds.length))

  // ラウンド優先で1列に並べる。全ブロックが①②を終えてから③④へ進む。
  const flat: { block: ScheduleBlock; pair: Pairing; numberInGroup: number; round: number }[] = []
  for (let r = 0; r < maxRounds; r++) {
    for (const { block, rounds, perRound } of byBlock) {
      const round = rounds[r]
      if (!round) continue
      round.forEach((pair, i) => {
        flat.push({ block, pair, numberInGroup: r * perRound + i + 1, round: r + 1 })
      })
    }
  }

  // コートと時刻に割り当てる。
  //
  // 単純に順番へ詰めると、ブロック数が少ないときに**同じ選手が同時刻の複数コートに出る**。
  // 1ブロックだけの4チームリーグを6コートに流すと6試合すべてが同じ枠に入ってしまう。
  // そのため、枠ごとに「すでにその枠にいるエントリー」を見て、衝突する試合は次の枠へ送る。
  const start = parseTime(opts.startTime)
  const slotEntries: Set<string>[] = []
  const slotCourts: number[] = []

  return flat.map((x, idx) => {
    const [a, b] = x.pair
    const entryIds: [string, string] = [x.block.entryIds[a - 1], x.block.entryIds[b - 1]]

    let slot = 0
    for (;; slot++) {
      if (slotEntries[slot] === undefined) {
        slotEntries[slot] = new Set()
        slotCourts[slot] = 0
      }
      const full = slotCourts[slot] >= opts.courtCount
      const clash = entryIds.some((e) => slotEntries[slot].has(e))
      if (!full && !clash) break
    }

    for (const e of entryIds) slotEntries[slot].add(e)
    const court = ++slotCourts[slot]

    return {
      blockId: x.block.id,
      blockLabel: x.block.label,
      numberInGroup: x.numberInGroup,
      number: idx + 1,
      entryIds,
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

/**
 * コート × 時刻のグリッドに並べ替える。印刷と画面の両方で使う。
 *
 * **試合を黙って落とさない。** 引数のコート数よりデータ側のコート番号が大きい場合は
 * グリッドを広げる。紙から試合が消えるより、列が増えて気づくほうがよい。
 */
export function toTimetable(matches: ScheduledMatch[], courtCount: number): TimetableRow[] {
  const maxCourt = matches.reduce((mx, m) => Math.max(mx, m.court), 0)
  const cols = Math.max(courtCount, maxCourt)

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
      cells: Array.from({ length: cols }, (_, i) => ({
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
   * 第1試合の審判を「タイムテーブルの何段目の選手」に頼むか。**1-based の段数**。
   * 第1号提供先の要項は3段目＝1段目の2つ下。
   */
  firstMatchRefereeRow: number
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

  // 枠（時刻）ごとに並べ直す。段数は枠の並びで数える。
  const times = [...new Set(matches.map((m) => m.scheduledAt))].sort(
    (a, b) => parseTime(a) - parseTime(b),
  )
  const rowOf = new Map(times.map((t, i) => [t, i]))
  const byRowCourt = new Map<string, ScheduledMatch>()
  for (const m of matches) byRowCourt.set(`${rowOf.get(m.scheduledAt)}:${m.court}`, m)

  const targetRow = opts.firstMatchRefereeRow - 1 // 1-based の段数を 0-based へ

  return matches.map((m) => {
    if (opts.style === 'MUTUAL') {
      return { matchNumber: m.number, fromMatchNumber: null, note: '相互審判' }
    }
    const row = rowOf.get(m.scheduledAt) ?? 0

    // 1段目の試合には敗者がまだいない。N段目の同じコートの選手に頼む。
    if (row === 0) {
      const from = byRowCourt.get(`${targetRow}:${m.court}`)
      return {
        matchNumber: m.number,
        fromMatchNumber: from ? from.number : null,
        note: from
          ? `タイムテーブル${opts.firstMatchRefereeRow}段目（第${from.number}試合）の選手`
          : `タイムテーブル${opts.firstMatchRefereeRow}段目の選手`,
      }
    }

    // 以降は敗者審。同じコートの1つ前の段の試合の敗者2名＋勝者1名。
    const prev = byRowCourt.get(`${row - 1}:${m.court}`)
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

export type ScheduleIssueKind =
  | 'DOUBLE_BOOKED'
  | 'BACK_TO_BACK'
  | 'REFEREE_CONFLICT'
  | 'COURT_COLLISION'

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

  // 同じ時刻・同じコートに2試合。
  for (const [time, ms] of bySlot) {
    const byCourt = new Map<number, number>()
    for (const m of ms) {
      const prev = byCourt.get(m.court)
      if (prev !== undefined) {
        issues.push({
          kind: 'COURT_COLLISION',
          detail: `${time} の ${m.court}番コートに2試合が入っています`,
          matchNumbers: [prev, m.number],
        })
      } else {
        byCourt.set(m.court, m.number)
      }
    }
  }

  // 連続試合。既定では警告しない（1枠空けを求める設定のときだけ）。
  const minGap = opts.minIntervalSlots ?? 0
  if (minGap > 0) {
    const slots = [...bySlot.keys()].sort((a, b) => parseTime(a) - parseTime(b))
    const slotIndex = new Map(slots.map((t, i) => [t, i]))
    // 配列順ではなく**時刻順**に見る。コート順に並んだ配列でも正しく判定するため。
    const sorted = [...matches].sort(
      (a, b) => (slotIndex.get(a.scheduledAt) ?? 0) - (slotIndex.get(b.scheduledAt) ?? 0),
    )
    const lastSlot = new Map<string, { slot: number; number: number }>()
    for (const m of sorted) {
      const si = slotIndex.get(m.scheduledAt) ?? 0
      for (const e of m.entryIds) {
        const prev = lastSlot.get(e)
        // 同一枠は DOUBLE_BOOKED の担当。ここでは扱わない。
        if (prev && si > prev.slot && si - prev.slot <= minGap) {
          issues.push({
            kind: 'BACK_TO_BACK',
            detail: `試合の間隔が ${minGap} 枠以下です（${minGap + 1} 枠以上空ける設定）`,
            matchNumbers: [prev.number, m.number],
          })
        }
        if (!prev || si > prev.slot) lastSlot.set(e, { slot: si, number: m.number })
      }
    }
  }

  return issues
}

/**
 * 審判割当の検証。
 *
 * **自分が試合中の選手を審判に指名していないか。** 同時刻に別コートで試合をしている
 * 選手は審判に立てない。紙に印字してから気づくと現場で破綻する。
 */
export function validateReferees(
  matches: ScheduledMatch[],
  assignments: RefereeAssignment[],
): ScheduleIssue[] {
  const byNumber = new Map(matches.map((m) => [m.number, m]))
  const issues: ScheduleIssue[] = []

  for (const a of assignments) {
    if (a.fromMatchNumber === null) continue
    const target = byNumber.get(a.matchNumber)
    const source = byNumber.get(a.fromMatchNumber)
    if (!target || !source) continue
    if (target.scheduledAt === source.scheduledAt) {
      issues.push({
        kind: 'REFEREE_CONFLICT',
        detail: `第${a.matchNumber}試合の審判に、同時刻に試合中の選手が指名されています`,
        matchNumbers: [a.matchNumber, a.fromMatchNumber],
      })
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
