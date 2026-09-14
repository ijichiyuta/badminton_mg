// 組合せ生成。docs/04-formats.md
//
// ・トーナメント：標準ブラケット順を再帰生成する。表を持たない
// ・BYE：シード本人の枠ではなく「初戦の相手枠」に置く
// ・リーグ：ブロック分割と対戦順序
//
// 対戦順序は第1号提供先の現行の組合せ表に一致させる（docs/17-first-customer.md）。
// 星取表のマスに入る丸数字が変わると「去年と違う」と現場で指摘されるため。

import type { Entry } from './types'

// ---------------------------------------------------------------------------
// 乱数
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------------------
// トーナメント：シード位置
// ---------------------------------------------------------------------------

export const MIN_BRACKET = 2
export const MAX_BRACKET = 128

/** 参加数以上で最小の2のべき乗。 */
export function bracketSize(entryCount: number): number {
  if (entryCount <= 1) return MIN_BRACKET
  let n = MIN_BRACKET
  while (n < entryCount) n *= 2
  if (n > MAX_BRACKET) throw new Error(`ブラケットサイズが上限を超えます: ${entryCount}名`)
  return n
}

/**
 * 標準ブラケット順 `S(N)` を再帰生成する。
 *
 * ```
 * S(2) = [1, 2]
 * S(2n) を S(n) から作る：
 *     S(n) の i 番目の要素 x について
 *         i が奇数 → (x, 2n + 1 - x) の順
 *         i が偶数 → (2n + 1 - x, x) の順
 * ```
 *
 * 生成される配列は**自己逆写像**であり、1つの配列で
 * 「シード s の位置」と「位置 p に入るシード」の両方を表す。
 * 返り値は 1-based の値を持つ 0-based 配列（`S[s - 1]` がシード s の位置）。
 */
export function seedOrder(n: number): number[] {
  if (n < MIN_BRACKET || (n & (n - 1)) !== 0) {
    throw new Error(`ブラケットサイズは2のべき乗である必要があります: ${n}`)
  }
  let a = [1, 2]
  while (a.length < n) {
    const m = a.length * 2
    const next: number[] = []
    a.forEach((x, i) => {
      // i は 0-based なので、1-based で奇数＝i が偶数。
      if (i % 2 === 0) next.push(x, m + 1 - x)
      else next.push(m + 1 - x, x)
    })
    a = next
  }
  return a
}

/** シード s（1-based）が入るブラケット上の位置（1-based）。 */
export function seedPosition(seed: number, n: number): number {
  const s = seedOrder(n)
  if (seed < 1 || seed > n) throw new Error(`シード番号が範囲外です: ${seed}`)
  return s[seed - 1]
}

/** 位置 p（1-based）の初戦の相手枠。 */
export function opponentSlot(position: number): number {
  return position % 2 === 1 ? position + 1 : position - 1
}

/**
 * BYE を置く位置（1-based）。
 *
 * **シード本人の枠ではなく、シードの初戦の相手枠に置く。**
 * 配置順は第1シードの相手 → 第2シードの相手 → …
 * BYE 数がシード数を超える場合も `S(N)` の並びを仮想的に延長して続ける。
 */
export function byePositions(bracket: number, entryCount: number): number[] {
  // 参加数がブラケットの半分未満なら、1回戦が成立しない枠が出る。
  // 実務では1つ下のブラケットを使うべきだが、ここでは可能な範囲で配置する。
  const count = bracket - entryCount
  if (count <= 0) return []
  const order = seedOrder(bracket)
  const used = new Set<number>()
  const out: number[] = []
  for (let seed = 1; seed <= bracket && out.length < count; seed++) {
    const slot = opponentSlot(order[seed - 1])
    if (used.has(slot)) continue
    // シード本人が入る枠を BYE で潰さない。
    if (!isSeedSlot(order, slot, seed)) {
      used.add(slot)
      out.push(slot)
    }
  }
  // 参加数がブラケットの半分未満のときは、上の規則だけでは足りない。
  // 残りはシード順の後ろから埋める（上位シードの山を空けたままにする）。
  for (let i = bracket - 1; i >= 0 && out.length < count; i--) {
    const slot = order[i]
    if (used.has(slot)) continue
    used.add(slot)
    out.push(slot)
  }
  return out
}

/** 位置 slot が、より上位のシードの本人枠になっていないか。 */
function isSeedSlot(order: number[], slot: number, upToSeed: number): boolean {
  for (let s = 1; s <= upToSeed; s++) {
    if (order[s - 1] === slot) return true
  }
  return false
}

export interface BracketSlot {
  /** 1-based のブラケット位置。 */
  position: number
  entryId: string | null
  /** 進出元が未確定の枠に表示するラベル（「C組1位（未確定）」）。 */
  label: string | null
  isBye: boolean
}

export interface BuildBracketOptions {
  /** 乱数シード。記録して再現可能にする。 */
  drawSeed: number
  /** ブラケットサイズを明示する場合。省略時は参加数から決める。 */
  size?: number
}

/**
 * トーナメント表を組む。
 * シードは `entry.seed` の昇順に固定位置へ、残りは抽選で配置する。
 */
export function buildBracket(entries: Entry[], opts: BuildBracketOptions): BracketSlot[] {
  const active = entries.filter((e) => e.status !== 'WITHDRAWN')
  const size = opts.size ?? bracketSize(active.length)
  if (size < active.length) {
    throw new Error(
      `ブラケットサイズ ${size} に ${active.length} エントリーは入りません。黙って切り捨てない`,
    )
  }
  const order = seedOrder(size)
  const slots: BracketSlot[] = Array.from({ length: size }, (_, i) => ({
    position: i + 1,
    entryId: null,
    label: null,
    isBye: false,
  }))

  for (const p of byePositions(size, active.length)) {
    slots[p - 1].isBye = true
  }

  const seeded = active
    .filter((e) => e.seed !== null)
    .sort((a, b) => (a.seed as number) - (b.seed as number))
  const unseeded = shuffled(
    active.filter((e) => e.seed === null),
    mulberry32(opts.drawSeed),
  )

  for (let i = 0; i < seeded.length; i++) {
    const pos = order[i]
    slots[pos - 1].entryId = seeded[i].id
    slots[pos - 1].isBye = false
  }

  const free = slots.filter((s) => s.entryId === null && !s.isBye)
  unseeded.forEach((e, i) => {
    if (i < free.length) free[i].entryId = e.id
  })

  return slots
}

// ---------------------------------------------------------------------------
// リーグ：ブロック分割
// ---------------------------------------------------------------------------

export interface SplitOptions {
  /** ブロック数を指定する方式。 */
  groupCount?: number
  /** 1ブロックあたりの人数を指定する方式。 */
  perGroup?: number
  /**
   * `perGroup` 指定時の端数の扱い。
   *
   * - `ABSORB`（既定）… ブロック数を減らし、**端数を既存ブロックに吸収して大きくする**。
   *   62組を4人ずつなら 5人×2 + 4人×13。第1号提供先の「4チームリーグ・5チームリーグ」と一致する
   * - `SPLIT` … ブロック数を増やし、端数ぶんの小さいブロックを作る。62組なら 4人×14 + 3人×2
   */
  remainderPolicy?: 'ABSORB' | 'SPLIT'
  /** 同一所属を同じブロックに入れない配慮を行う。 */
  separateSameAffiliation: boolean
  drawSeed: number
}

export interface SplitResult {
  /** ブロックごとのエントリーID。 */
  groups: string[][]
  /** 同一所属を分離しきれなかったブロックの添字。 */
  unresolvedAffiliationGroups: number[]
}

/**
 * ブロック分割。
 *
 * 端数が出る場合、**上位のブロックから多く配分する**（3名・3名・2名）。
 * 第1号提供先では4チームが基本で、申込状況により5チームのブロックが混ざる。
 */
export function splitIntoGroups(entries: Entry[], opts: SplitOptions): SplitResult {
  const active = entries.filter((e) => e.status !== 'WITHDRAWN')
  const n = active.length
  if (n === 0) return { groups: [], unresolvedAffiliationGroups: [] }

  let count: number
  if (opts.groupCount !== undefined) {
    count = Math.max(1, Math.min(opts.groupCount, n))
  } else if (opts.perGroup !== undefined && opts.perGroup > 0) {
    count =
      (opts.remainderPolicy ?? 'ABSORB') === 'ABSORB'
        ? Math.max(1, Math.floor(n / opts.perGroup))
        : Math.max(1, Math.ceil(n / opts.perGroup))
  } else {
    throw new Error('groupCount か perGroup のどちらかを指定してください')
  }

  // 端数は先頭のブロックへ。
  const base = Math.floor(n / count)
  const extra = n % count
  const sizes = Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0))

  const rng = mulberry32(opts.drawSeed)
  // シード順を保ったまま、同順位内だけ抽選する。
  const seeded = active.filter((e) => e.seed !== null).sort((a, b) => (a.seed as number) - (b.seed as number))
  const rest = shuffled(active.filter((e) => e.seed === null), rng)
  const pool = [...seeded, ...rest]

  const groups: string[][] = Array.from({ length: count }, () => [])
  // 蛇行配分。シード上位が別ブロックに散る。
  let gi = 0
  let dir = 1
  for (const e of pool) {
    let guard = 0
    while (groups[gi].length >= sizes[gi]) {
      gi += dir
      if (gi >= count) { gi = count - 1; dir = -1 }
      else if (gi < 0) { gi = 0; dir = 1 }
      if (++guard > count * 4) break
    }
    groups[gi].push(e.id)
    gi += dir
    if (gi >= count) { gi = count - 1; dir = -1 }
    else if (gi < 0) { gi = 0; dir = 1 }
  }

  const unresolved: number[] = []
  if (opts.separateSameAffiliation) {
    const aff = new Map(active.map((e) => [e.id, e.affiliation ?? '']))
    repairAffiliations(groups, aff)
    groups.forEach((g, i) => {
      const seen = new Set<string>()
      for (const id of g) {
        const a = aff.get(id) ?? ''
        if (a === '') continue
        if (seen.has(a)) { unresolved.push(i); break }
        seen.add(a)
      }
    })
  }

  return { groups, unresolvedAffiliationGroups: unresolved }
}

/** 同一所属が同じブロックに入っていたら、可能な範囲で他ブロックと入れ替える。 */
function repairAffiliations(groups: string[][], aff: Map<string, string>): void {
  const dup = (g: string[]): number => {
    const seen = new Set<string>()
    for (let i = 0; i < g.length; i++) {
      const a = aff.get(g[i]) ?? ''
      if (a === '') continue
      if (seen.has(a)) return i
      seen.add(a)
    }
    return -1
  }

  for (let pass = 0; pass < groups.length * 3; pass++) {
    let moved = false
    for (let i = 0; i < groups.length; i++) {
      const k = dup(groups[i])
      if (k < 0) continue
      const a = aff.get(groups[i][k]) ?? ''
      for (let j = 0; j < groups.length && !moved; j++) {
        if (i === j) continue
        if (groups[j].some((id) => (aff.get(id) ?? '') === a)) continue
        for (let l = 0; l < groups[j].length; l++) {
          const b = aff.get(groups[j][l]) ?? ''
          // 交換しても i 側で新たな重複を作らないこと。
          if (b !== '' && groups[i].some((id, idx) => idx !== k && (aff.get(id) ?? '') === b)) continue
          ;[groups[i][k], groups[j][l]] = [groups[j][l], groups[i][k]]
          moved = true
          break
        }
      }
      if (moved) break
    }
    if (!moved) break
  }
}

// ---------------------------------------------------------------------------
// リーグ：対戦順序
// ---------------------------------------------------------------------------

/** 1試合。ブロック内の 1-based インデックスの組。 */
export type Pairing = [number, number]

/**
 * 第1号提供先の現行の組合せ表から読み取った対戦順。
 * 星取表のマスに入る丸数字（①〜⑩）がこの順に対応する。
 *
 * 4チーム：① 1-2 / ② 3-4 / ③ 1-3 / ④ 2-4 / ⑤ 1-4 / ⑥ 2-3
 * 5チーム：① 1-2 / ② 3-4 / ③ 1-5 / ④ 2-3 / ⑤ 4-5 / ⑥ 1-3 / ⑦ 2-4 / ⑧ 3-5 / ⑨ 1-4 / ⑩ 2-5
 */
export const NJSF_PAIRINGS: Record<number, Pairing[]> = {
  2: [[1, 2]],
  3: [[1, 2], [1, 3], [2, 3]],
  4: [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]],
  5: [[1, 2], [3, 4], [1, 5], [2, 3], [4, 5], [1, 3], [2, 4], [3, 5], [1, 4], [2, 5]],
}

/** 巡回法（サークルメソッド）でラウンドを生成する。各ラウンドで同じ選手は1回だけ。 */
export function circleRounds(n: number): Pairing[][] {
  if (n < 2) return []
  const odd = n % 2 === 1
  const m = odd ? n + 1 : n // 奇数なら休みの枠を足す
  const ids = Array.from({ length: m }, (_, i) => i + 1)
  const rounds: Pairing[][] = []
  for (let r = 0; r < m - 1; r++) {
    const round: Pairing[] = []
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i]
      const b = ids[m - 1 - i]
      if (a <= n && b <= n) round.push(a < b ? [a, b] : [b, a])
    }
    rounds.push(round)
    // 先頭を固定して残りを回す。
    const fixed = ids[0]
    const rot = ids.slice(1)
    rot.unshift(rot.pop() as number)
    ids.splice(0, ids.length, fixed, ...rot)
  }
  return rounds
}

export type PairingStyle = 'njsf' | 'circle'

/**
 * ブロック内の対戦順。返り値の添字 + 1 が星取表の丸数字になる。
 *
 * `njsf` は現行の組合せ表と同じ並び。表にない人数では巡回法に落ちる。
 */
export function roundRobinPairings(n: number, style: PairingStyle = 'njsf'): Pairing[] {
  if (n < 2) return []
  if (style === 'njsf' && NJSF_PAIRINGS[n]) return NJSF_PAIRINGS[n].map((p) => [...p] as Pairing)
  return circleRounds(n).flat()
}

/** 全組み合わせが1回ずつ現れるか。 */
export function isCompleteRoundRobin(n: number, pairings: Pairing[]): boolean {
  const expected = (n * (n - 1)) / 2
  if (pairings.length !== expected) return false
  const seen = new Set<string>()
  for (const [a, b] of pairings) {
    if (a === b || a < 1 || b < 1 || a > n || b > n) return false
    seen.add(a < b ? `${a}-${b}` : `${b}-${a}`)
  }
  return seen.size === expected
}

/**
 * 対戦順を、同時進行するラウンドに切り分ける。
 *
 * 現行のタイムテーブルは全ブロックを同じペースで回し、
 * 1ラウンドで各ブロックの①②、次のラウンドで③④…と並べている。
 * したがって「連続する試合」は時間的には**並行**であり、
 * 同一ラウンド内で同じ選手が重複してはならない。
 */
export function roundsOf(pairings: Pairing[], perRound: number): Pairing[][] {
  const rounds: Pairing[][] = []
  for (let i = 0; i < pairings.length; i += perRound) {
    rounds.push(pairings.slice(i, i + perRound))
  }
  return rounds
}

/** ラウンド内で同じ選手が2回出ていないか。 */
export function roundsAreDisjoint(pairings: Pairing[], perRound: number): boolean {
  for (const r of roundsOf(pairings, perRound)) {
    const seen = new Set<number>()
    for (const [a, b] of r) {
      if (seen.has(a) || seen.has(b)) return false
      seen.add(a)
      seen.add(b)
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// トーナメント：試合ツリーの組み立て
// ---------------------------------------------------------------------------

/** ドロー表の1試合ぶん。id は呼び出し側が振る前提で、ここでは添字で表す。 */
export interface BracketMatch {
  /** 1回戦が 1。 */
  round: number
  /** そのラウンドの中の位置。1 始まり。 */
  slotInRound: number
  /** 入る2者。BYE と未確定は null。 */
  entryIds: (string | null)[]
  /** この試合の勝者が進む試合。決勝は null。 */
  next: { round: number; slotInRound: number } | null
  /**
   * 相手が BYE のため、実施せずに勝ち上がる試合。
   *
   * **不戦勝として1勝に数える**が、ゲーム率・得点率の分母には入れない。
   * 対戦相手が存在しないので比較のしようがない（docs/05）。
   */
  isBye: boolean
}

/**
 * ドローの枠から試合ツリーを組み立てる。
 *
 * 1回戦は隣り合う2枠を突き合わせ、以降は勝者を半分ずつ集める。
 * **BYE の枠と当たった試合は実施しない。**その枠の相手がそのまま2回戦に入る。
 *
 * 実データ（愛知県新人大会 12ドロー）では、131人が256のドローに入って
 * 1回戦がわずか2試合、という形が普通に出てくる。BYE は例外ではなく前提。
 */
export function buildBracketMatches(slots: BracketSlot[]): BracketMatch[] {
  const size = slots.length
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error(`ドローの枠数は2の冪でなければなりません: ${size}`)
  }
  const rounds = Math.log2(size)
  const out: BracketMatch[] = []

  // 1回戦。BYE と当たった枠はそのまま2回戦へ送る。
  let carried: (string | null)[] = []
  for (let i = 0; i < size; i += 2) {
    const a = slots[i]
    const b = slots[i + 1]
    const slotInRound = i / 2 + 1
    const next = rounds > 1 ? { round: 2, slotInRound: Math.ceil(slotInRound / 2) } : null
    const bye = a.isBye || b.isBye
    out.push({
      round: 1,
      slotInRound,
      entryIds: [a.entryId, b.entryId],
      next,
      isBye: bye,
    })
    carried.push(bye ? (a.isBye ? b.entryId : a.entryId) : null)
  }

  // 2回戦以降。BYE で上がってきた者だけ、最初から埋まった状態で置く。
  for (let r = 2; r <= rounds; r++) {
    const n = size / 2 ** r
    const prev = carried
    carried = []
    for (let i = 0; i < n; i++) {
      const slotInRound = i + 1
      const next = r < rounds ? { round: r + 1, slotInRound: Math.ceil(slotInRound / 2) } : null
      out.push({
        round: r,
        slotInRound,
        entryIds: [prev[i * 2] ?? null, prev[i * 2 + 1] ?? null],
        next,
        isBye: false,
      })
      carried.push(null)
    }
  }

  return out
}

/** ラウンドの呼び方。決勝から遡って数える。 */
export function roundLabel(round: number, rounds: number): string {
  const fromEnd = rounds - round
  if (fromEnd === 0) return '決勝'
  if (fromEnd === 1) return '準決勝'
  if (fromEnd === 2) return '準々決勝'
  return `${round}回戦`
}
