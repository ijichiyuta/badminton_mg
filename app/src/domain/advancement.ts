// 進出処理。docs/04-formats.md 3節 / docs/03-domain-model.md
//
// 予選リーグ → 決勝トーナメントは独立した形式ではない。
// ROUND_ROBIN ステージ + SINGLE_ELIMINATION ステージ + AdvancementRule（ADR-0002）。
//
// 最も間違えやすいのは「同一ブロック出身者が1回戦で当たってはならない」という制約。
// 4ブロックから各上位2名の標準的な配置は次のとおり（docs/04-formats.md）。
//
//   A組1位 vs B組2位 / C組1位 vs D組2位 / B組1位 vs A組2位 / D組1位 vs C組2位

import { bracketSize, opponentSlot, seedOrder, type BracketSlot } from './draw'

/** 進出枠の識別子。どのブロックの何位か。 */
export interface AdvancerKey {
  /** 0-based のブロック添字。 */
  groupIndex: number
  /** 1-based の順位。 */
  rank: number
}

export interface Advancer extends AdvancerKey {
  /** 確定していれば入る。未確定なら null。 */
  entryId: string | null
  /** 「A組1位（未確定）」のような表示。 */
  label: string
}

/**
 * 進出者をブラケットへ配置する順序（シード順）を、回転量 `rot` から作る。
 *
 * 1位はブロック順のまま、2位以降はブロック列を `rot` だけずらして入れる。
 * 適切な `rot` はブロック数によって変わるため、`advancerSeedOrder` が探索する。
 */
export function advancerSeedOrderWithRotation(
  groupCount: number,
  topN: number,
  rot: number,
): AdvancerKey[] {
  const out: AdvancerKey[] = []
  for (let rank = 1; rank <= topN; rank++) {
    const r = (rot * (rank - 1)) % groupCount
    for (let i = 0; i < groupCount; i++) {
      out.push({ groupIndex: (i + r) % groupCount, rank })
    }
  }
  return out
}

/**
 * 進出者のシード順。
 *
 * **同一ブロック出身者が1回戦で当たらない回転量を探索する。**
 * 単一の式（半周ずらす等）では、ブロック数によって同組対戦が発生する。
 * 2ブロックでは半周＝1がそのまま衝突し、7ブロックでも3では衝突する。
 *
 * 探索は `floor(groupCount / 2)` から始めるため、
 * 4ブロック各上位2名では docs/04-formats.md の標準配置がそのまま選ばれる。
 */
export function advancerSeedOrder(groupCount: number, topN: number): AdvancerKey[] {
  const candidates = rotationCandidates(groupCount)
  let best: { keys: AdvancerKey[]; meeting: number } | null = null

  for (const rot of candidates) {
    const keys = advancerSeedOrderWithRotation(groupCount, topN, rot)
    const slots = layout(keys, bracketSize(groupCount * topN))
    if (!hasSameGroupFirstRound(slots)) return keys
    const meeting = earliestSameGroupMeeting(slots)
    if (best === null || meeting > best.meeting) best = { keys, meeting }
  }

  // どの回転でも1回戦の同組対戦を避けられない構成（進出者数がブロック数に対して多い等）。
  // 最も遅く当たる配置を返す。
  return best ? best.keys : advancerSeedOrderWithRotation(groupCount, topN, 0)
}

/** 探索する回転量。半周を最初に試す。 */
function rotationCandidates(groupCount: number): number[] {
  const half = Math.floor(groupCount / 2)
  const rest = Array.from({ length: groupCount }, (_, i) => i).filter((r) => r !== half)
  return [half, ...rest]
}

/** シード順をブラケット位置へ落とす。 */
function layout(keys: AdvancerKey[], size: number): Placement[] {
  const order = seedOrder(size)
  const slots: Placement[] = Array.from({ length: size }, (_, i) => ({
    position: i + 1,
    key: null,
    isBye: false,
  }))
  keys.slice(0, size).forEach((key, i) => {
    slots[order[i] - 1].key = key
  })
  for (const s of slots) if (s.key === null) s.isBye = true
  return slots
}

export interface PlacementOptions {
  groupCount: number
  topN: number
  /** 全ブロック横断で拾う敗者復活枠。 */
  wildcards?: number
  /** ブラケットサイズ。省略時は進出者数から決める。 */
  size?: number
  /** 配置方針。CROSS＝交差配置、SEQUENTIAL＝素直に並べる。 */
  placement?: 'CROSS' | 'SEQUENTIAL'
}

export interface Placement {
  /** 1-based のブラケット位置。 */
  position: number
  key: AdvancerKey | null
  isBye: boolean
}

/** ブロック名。A組・B組…。 */
export function groupName(index: number): string {
  return `${String.fromCharCode(0x41 + index)}組`
}

export function advancerLabel(key: AdvancerKey, confirmed: boolean): string {
  const base = `${groupName(key.groupIndex)}${key.rank}位`
  return confirmed ? base : `${base}（未確定）`
}

/**
 * 進出者の配置を決める。
 *
 * 進出者数がブラケットサイズに満たない場合は BYE を入れる。
 * **BYE は各ブロック1位に優先して割り当てる**（上位シードの相手枠へ）。
 */
export function placeAdvancers(opts: PlacementOptions): Placement[] {
  const { groupCount, topN } = opts
  const wildcards = opts.wildcards ?? 0
  const total = groupCount * topN + wildcards
  if (total <= 0) return []

  const size = opts.size ?? bracketSize(total)
  const keys =
    opts.placement === 'SEQUENTIAL'
      ? sequentialOrder(groupCount, topN)
      : advancerSeedOrder(groupCount, topN)

  // ワイルドカードは順位の後ろに積む（ブロック横断の成績上位）。
  for (let i = 0; i < wildcards; i++) {
    keys.push({ groupIndex: -1, rank: topN + 1 + i })
  }

  return layout(keys, size)
}

function sequentialOrder(groupCount: number, topN: number): AdvancerKey[] {
  const out: AdvancerKey[] = []
  for (let rank = 1; rank <= topN; rank++) {
    for (let g = 0; g < groupCount; g++) out.push({ groupIndex: g, rank })
  }
  return out
}

/** 1回戦で同一ブロック出身者が当たっていないか。 */
export function hasSameGroupFirstRound(slots: Placement[]): boolean {
  for (let p = 1; p <= slots.length; p += 2) {
    const a = slots[p - 1].key
    const b = slots[p].key
    if (!a || !b) continue
    if (a.groupIndex >= 0 && a.groupIndex === b.groupIndex) return true
  }
  return false
}

/** 同一ブロック出身者が初めて当たりうるラウンド。大きいほど良い配置。 */
export function earliestSameGroupMeeting(slots: Placement[]): number {
  const size = slots.length
  const rounds = Math.log2(size)
  for (let r = 1; r <= rounds; r++) {
    const span = 2 ** r
    for (let start = 0; start < size; start += span) {
      const seen = new Map<number, number>()
      for (let i = start; i < start + span; i++) {
        const k = slots[i].key
        if (!k || k.groupIndex < 0) continue
        const prev = seen.get(k.groupIndex)
        if (prev !== undefined) return r
        seen.set(k.groupIndex, i)
      }
    }
  }
  return rounds + 1
}

// ---------------------------------------------------------------------------
// 部分進出
// ---------------------------------------------------------------------------

export interface GroupResult {
  groupIndex: number
  /** このブロックの全試合が完了しているか。 */
  completed: boolean
  /** 順位順のエントリーID。未完了なら暫定。 */
  rankedEntryIds: string[]
}

export interface ResolveOptions extends PlacementOptions {
  /**
   * 一部のブロックだけ完了していても、確定した分を流し込む。
   * 1人運用では全ブロックの完了を待つと進行が止まる（docs/04-formats.md 3節）。
   */
  allowPartial: boolean
}

export interface ResolvedBracket {
  slots: BracketSlot[]
  /** 未確定の枠が残っているか。 */
  hasUnconfirmed: boolean
  /** 未確定の枠のラベル。UI の警告に使う。 */
  unconfirmedLabels: string[]
}

/**
 * ブロックの結果を決勝ブラケットへ流し込む。
 *
 * `allowPartial` が false のときは、全ブロックが完了するまで1枠も埋めない。
 * true（既定）のときは確定した分だけ埋め、残りは「A組1位（未確定）」として保持する。
 */
export function resolveBracket(results: GroupResult[], opts: ResolveOptions): ResolvedBracket {
  const placements = placeAdvancers(opts)
  const byIndex = new Map(results.map((r) => [r.groupIndex, r]))
  const allDone = results.every((r) => r.completed)

  const slots: BracketSlot[] = placements.map((p) => {
    if (p.key === null) {
      return { position: p.position, entryId: null, label: null, isBye: p.isBye }
    }
    const g = byIndex.get(p.key.groupIndex)
    const confirmed =
      g !== undefined && g.completed && g.rankedEntryIds.length >= p.key.rank && (allDone || opts.allowPartial)
    return {
      position: p.position,
      entryId: confirmed ? g.rankedEntryIds[p.key.rank - 1] : null,
      label: advancerLabel(p.key, confirmed),
      isBye: p.isBye,
    }
  })

  const unconfirmed = slots.filter((s) => s.entryId === null && !s.isBye && s.label !== null)
  return {
    slots,
    hasUnconfirmed: unconfirmed.length > 0,
    unconfirmedLabels: unconfirmed.map((s) => s.label as string),
  }
}

// ---------------------------------------------------------------------------
// ワイルドカード（ブロック横断の成績比較）
// ---------------------------------------------------------------------------

export interface WildcardCandidate {
  entryId: string
  groupIndex: number
  /** ブロック内順位。 */
  rankInGroup: number
  /** 比較に使う指標の値。降順で強い。 */
  score: number
  /** そのブロックの実施試合数。揃っていなければ比較が不公平になる。 */
  played: number
}

export interface WildcardResult {
  selected: string[]
  warnings: string[]
}

/**
 * 全ブロック横断で成績上位を拾う。
 *
 * **ブロックのチーム数が違うと試合数が揃わず、比較が不公平になる。**
 * 第1号提供先では4チームと5チームのブロックが混ざるため、必ず検証する。
 */
export function selectWildcards(
  candidates: WildcardCandidate[],
  count: number,
): WildcardResult {
  const warnings: string[] = []
  if (count <= 0) return { selected: [], warnings }

  const playedCounts = new Set(candidates.map((c) => c.played))
  if (playedCounts.size > 1) {
    warnings.push(
      'ブロックによって実施試合数が違います。ブロックを横断した成績比較は不公平になります',
    )
  }

  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.rankInGroup - b.rankInGroup || a.groupIndex - b.groupIndex,
  )
  const selected = sorted.slice(0, count)

  // 同点で切れている場合は抽選が必要になる。
  if (sorted.length > count && selected.length > 0) {
    const last = selected[selected.length - 1]
    const next = sorted[count]
    if (last.score === next.score) {
      warnings.push('最後の枠が同成績で並んでいます。抽選か追加の基準が必要です')
    }
  }

  return { selected: selected.map((c) => c.entryId), warnings }
}

/** BYE を各ブロック1位に優先して割り当てたときの位置。 */
export function advancerByePositions(total: number, size: number): number[] {
  const count = size - total
  if (count <= 0) return []
  const order = seedOrder(size)
  const out: number[] = []
  const used = new Set<number>()
  for (let i = 0; i < size && out.length < count; i++) {
    const slot = opponentSlot(order[i])
    if (used.has(slot)) continue
    if (order.slice(0, i + 1).includes(slot)) continue
    used.add(slot)
    out.push(slot)
  }
  return out
}
