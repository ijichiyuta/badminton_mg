// ユースケース。ドメイン層と永続化層をつなぐ。
//
// すべての書き込みは操作ログを残し、Undo できる（UX原則3）。
// 確認ダイアログで守らない。取り消せることで確認の必要をなくす。

import { splitIntoGroups } from '../domain/draw'
import {
  defaultRankingRule,
  findRankingPreset,
  findScoringPreset,
  DEFAULT_RANKING_PRESET_ID,
  DEFAULT_SCORING_PRESET_ID,
} from '../domain/presets'
import { rank, type RankingContext } from '../domain/ranking'
import { buildSchedule, type ScheduleBlock, type ScheduleOptions } from '../domain/schedule'
import { judgeMatch } from '../domain/scoring'
import type {
  Entry,
  Game,
  Match,
  RankingResult,
  ResultType,
  ScoringRuleSet,
} from '../domain/types'
import { db, type BadmintonDb } from './db'
import type {
  EntryRecord,
  EventRecord,
  GroupRecord,
  MatchRecord,
  OperationPatch,
  OperationRecord,
  OperationType,
  PlayerRecord,
  RankingRuleRecord,
  ScoringRuleRecord,
  StageRecord,
  TournamentRecord,
} from './schema'
import { SCHEMA_VERSION } from './schema'

let counter = 0
export function newId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
}

function now(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// 大会の作成
// ---------------------------------------------------------------------------

export interface CreateTournamentInput {
  name: string
  date: string
  venue?: string
  organizer?: string
  courtCount: number
  scoringPresetId?: string
  rankingPresetId?: string
}

export async function createTournament(
  input: CreateTournamentInput,
  d: BadmintonDb = db(),
): Promise<TournamentRecord> {
  const id = newId('t')
  const scoringPresetId = input.scoringPresetId ?? DEFAULT_SCORING_PRESET_ID
  const rankingPresetId = input.rankingPresetId ?? DEFAULT_RANKING_PRESET_ID

  const preset = findScoringPreset(scoringPresetId)
  if (!preset) throw new Error(`採点プリセットが見つかりません: ${scoringPresetId}`)
  const { label: _l, common: _c, note: _n, ...scoringRule } = preset

  const rankingPreset = findRankingPreset(rankingPresetId)
  const rankingRule: RankingRuleRecord = {
    ...(rankingPreset
      ? (({ label: _rl, wording: _rw, ...r }) => r)(rankingPreset)
      : defaultRankingRule()),
    id: newId('rr'),
    tournamentId: id,
  }

  const rec: TournamentRecord = {
    id,
    name: input.name,
    date: input.date,
    venue: input.venue ?? '',
    organizer: input.organizer ?? '',
    courts: Array.from({ length: input.courtCount }, (_, i) => ({
      id: `c${i + 1}`,
      name: `${i + 1}番コート`,
    })),
    defaultScoringRuleId: scoringRule.id,
    defaultRankingRulePresetId: rankingRule.id,
    stageScoringPresetId: 'uniform-15pt-3g',
    publicToken: null,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now(),
    updatedAt: now(),
  }

  await d.transaction('rw', [d.tournaments, d.scoringRules, d.rankingRules], async () => {
    await d.tournaments.put(rec)
    await d.scoringRules.put({ ...scoringRule, tournamentId: id } as ScoringRuleRecord)
    await d.rankingRules.put(rankingRule)
  })
  return rec
}

/** 種目を追加する。 */
export async function addEvent(
  tournamentId: string,
  input: Omit<EventRecord, 'id' | 'tournamentId' | 'order'> & { order?: number },
  d: BadmintonDb = db(),
): Promise<EventRecord> {
  const count = await d.events.where({ tournamentId }).count()
  const rec: EventRecord = {
    ...input,
    id: newId('ev'),
    tournamentId,
    order: input.order ?? count + 1,
  }
  await d.events.put(rec)
  return rec
}

/** ステージを追加する。 */
export async function addStage(
  tournamentId: string,
  eventId: string,
  input: Partial<Omit<StageRecord, 'id' | 'tournamentId' | 'eventId'>> & { name: string },
  d: BadmintonDb = db(),
): Promise<StageRecord> {
  const count = await d.stages.where({ eventId }).count()
  const rec: StageRecord = {
    id: newId('st'),
    tournamentId,
    eventId,
    order: input.order ?? count + 1,
    name: input.name,
    type: input.type ?? 'ROUND_ROBIN',
    scoringRuleId: input.scoringRuleId ?? null,
    truncate: input.truncate ?? false,
    options: input.options ?? {},
  }
  await d.stages.put(rec)
  return rec
}

// ---------------------------------------------------------------------------
// 参加者
// ---------------------------------------------------------------------------

export interface EntryInput {
  /** ペアなら2名、個人なら1名、団体ならチーム名を使う。 */
  playerNames: string[]
  affiliation?: string
  teamName?: string
  seed?: number | null
}

/** 参加者を一括登録する。Excel からの貼り付けを想定した形。 */
export async function addEntries(
  tournamentId: string,
  eventId: string,
  inputs: EntryInput[],
  d: BadmintonDb = db(),
): Promise<EntryRecord[]> {
  const players: PlayerRecord[] = []
  const entries: EntryRecord[] = []

  for (const input of inputs) {
    const playerIds: string[] = []
    for (const name of input.playerNames) {
      const p: PlayerRecord = {
        id: newId('p'),
        tournamentId,
        name,
        affiliation: input.affiliation,
      }
      players.push(p)
      playerIds.push(p.id)
    }
    entries.push({
      id: newId('en'),
      tournamentId,
      eventId,
      playerIds,
      teamName: input.teamName,
      affiliation: input.affiliation,
      seed: input.seed ?? null,
      status: 'ACTIVE',
    })
  }

  await d.transaction('rw', [d.players, d.entries], async () => {
    await d.players.bulkPut(players)
    await d.entries.bulkPut(entries)
  })
  return entries
}

// ---------------------------------------------------------------------------
// 組合せとスケジュール
// ---------------------------------------------------------------------------

export interface BuildDrawInput {
  stageId: string
  groupCount?: number
  perGroup?: number
  remainderPolicy?: 'ABSORB' | 'SPLIT'
  separateSameAffiliation?: boolean
  drawSeed: number
}

/** ブロック分割を行い、組を保存する。抽選のやり直しは何度でもできる。 */
export async function buildGroups(
  input: BuildDrawInput,
  d: BadmintonDb = db(),
): Promise<GroupRecord[]> {
  const stage = await d.stages.get(input.stageId)
  if (!stage) throw new Error(`ステージが見つかりません: ${input.stageId}`)

  const entries = await d.entries.where({ eventId: stage.eventId }).toArray()
  const result = splitIntoGroups(entries as Entry[], {
    groupCount: input.groupCount,
    perGroup: input.perGroup,
    remainderPolicy: input.remainderPolicy,
    separateSameAffiliation: input.separateSameAffiliation ?? true,
    drawSeed: input.drawSeed,
  })

  const groups: GroupRecord[] = result.groups.map((entryIds, i) => ({
    id: newId('gr'),
    tournamentId: stage.tournamentId,
    eventId: stage.eventId,
    stageId: stage.id,
    order: i + 1,
    name: `${String.fromCharCode(0x41 + i)}組`,
    entryIds,
    scoringRuleId: null,
  }))

  await d.transaction('rw', [d.groups, d.matches], async () => {
    // 確定前のやり直しなので、既存の組と試合をまとめて捨てる。
    await d.groups.where({ stageId: stage.id }).delete()
    await d.matches.where({ stageId: stage.id }).delete()
    await d.groups.bulkPut(groups)
  })
  return groups
}

/** タイムテーブルを組み、試合を採番して保存する。 */
export async function buildMatches(
  tournamentId: string,
  opts: ScheduleOptions,
  d: BadmintonDb = db(),
): Promise<MatchRecord[]> {
  const t = await d.tournaments.get(tournamentId)
  if (!t) throw new Error(`大会が見つかりません: ${tournamentId}`)

  const stages = (await d.stages.where({ tournamentId }).toArray()).sort((a, b) => a.order - b.order)
  const events = await d.events.where({ tournamentId }).toArray()
  const eventById = new Map(events.map((e) => [e.id, e]))
  const allGroups = (await d.groups.where({ tournamentId }).toArray()).sort(
    (a, b) => a.order - b.order,
  )

  const blocks: ScheduleBlock[] = []
  const stageOfBlock = new Map<string, StageRecord>()
  for (const st of stages) {
    const ev = eventById.get(st.eventId)
    for (const g of allGroups.filter((x) => x.stageId === st.id)) {
      blocks.push({
        id: g.id,
        label: `${ev?.name ?? ''} ${g.name}`.trim(),
        entryIds: g.entryIds,
        scoringRuleId: effectiveScoringRuleId(t, ev, st, g),
      })
      stageOfBlock.set(g.id, st)
    }
  }

  const scheduled = buildSchedule(blocks, opts)
  const matches: MatchRecord[] = scheduled.map((s) => {
    const st = stageOfBlock.get(s.blockId) as StageRecord
    return {
      id: newId('m'),
      tournamentId,
      eventId: st.eventId,
      stageId: st.id,
      groupId: s.blockId,
      tieId: null,
      number: s.number,
      numberInGroup: s.numberInGroup,
      round: s.round,
      slotInRound: s.court,
      entryIds: [s.entryIds[0], s.entryIds[1]],
      status: 'READY',
      resultType: 'NORMAL',
      games: [],
      winnerEntryId: null,
      retiredEntryId: null,
      scoringRuleId: s.scoringRuleId,
      courtId: `c${s.court}`,
      scheduledAt: s.scheduledAt,
      completedAt: null,
      nextMatchId: null,
      loserNextMatchId: null,
    }
  })

  await d.transaction('rw', [d.matches], async () => {
    await d.matches.where({ tournamentId }).delete()
    await d.matches.bulkPut(matches)
  })
  return matches
}

/** 採点方式の実効値を Tournament → Event → Stage → Group の順に解決する。 */
export function effectiveScoringRuleId(
  t: TournamentRecord,
  ev: EventRecord | undefined,
  st: StageRecord | undefined,
  g: GroupRecord | undefined,
): string {
  return (
    g?.scoringRuleId ?? st?.scoringRuleId ?? ev?.scoringRuleId ?? t.defaultScoringRuleId
  )
}

// ---------------------------------------------------------------------------
// 結果入力
// ---------------------------------------------------------------------------

export interface EnterResultInput {
  matchId: string
  games: Game[]
  resultType?: ResultType
  /** RETIRED / WITHDRAWN / DISQUALIFIED のとき、退いた側。 */
  retiredEntryId?: string | null
  /** 判定できないときの手動指定。 */
  winnerEntryId?: string | null
}

export interface EnterResultOutput {
  match: MatchRecord
  operation: OperationRecord
}

/**
 * 試合結果を入力する。
 *
 * 即時に永続化し、操作ログを残す。確認ダイアログは出さない。
 * 取り消しは `undo()`（トーストの「取り消す」）で行う。
 */
export async function enterResult(
  input: EnterResultInput,
  d: BadmintonDb = db(),
): Promise<EnterResultOutput> {
  const before = await d.matches.get(input.matchId)
  if (!before) throw new Error(`試合が見つかりません: ${input.matchId}`)

  const rule = await resolveScoringRule(before, d)
  const resultType = input.resultType ?? 'NORMAL'

  let winnerEntryId: string | null = input.winnerEntryId ?? null
  if (winnerEntryId === null && resultType === 'NORMAL') {
    const j = judgeMatch(input.games, rule)
    winnerEntryId =
      j.winner === 'A' ? before.entryIds[0] : j.winner === 'B' ? before.entryIds[1] : null
  }

  const after: MatchRecord = {
    ...before,
    games: input.games,
    resultType,
    // NOT_PLAYED だけが勝者を持たない（不変条件2）。
    status: resultType === 'NOT_PLAYED' || winnerEntryId !== null ? 'COMPLETED' : before.status,
    winnerEntryId: resultType === 'NOT_PLAYED' ? null : winnerEntryId,
    retiredEntryId: input.retiredEntryId ?? null,
    completedAt: now(),
  }

  const op = await writeWithLog(
    d,
    before.tournamentId,
    'MATCH_RESULT_ENTERED',
    `第${before.number}試合を記録しました`,
    [{ table: 'matches', key: before.id, value: before }],
    [{ table: 'matches', key: after.id, value: after }],
  )

  return { match: after, operation: op }
}

/** 入力を取り消して未入力に戻す。 */
export async function clearResult(
  matchId: string,
  d: BadmintonDb = db(),
): Promise<EnterResultOutput> {
  const before = await d.matches.get(matchId)
  if (!before) throw new Error(`試合が見つかりません: ${matchId}`)

  const after: MatchRecord = {
    ...before,
    games: [],
    status: 'READY',
    resultType: 'NORMAL',
    winnerEntryId: null,
    retiredEntryId: null,
    completedAt: null,
  }

  const op = await writeWithLog(
    d,
    before.tournamentId,
    'MATCH_RESULT_CLEARED',
    `第${before.number}試合の結果を取り消しました`,
    [{ table: 'matches', key: before.id, value: before }],
    [{ table: 'matches', key: after.id, value: after }],
  )
  return { match: after, operation: op }
}

async function resolveScoringRule(m: Match, d: BadmintonDb): Promise<ScoringRuleSet> {
  if (m.scoringRuleId) {
    const r = await d.scoringRules.get(m.scoringRuleId)
    if (r) return r
  }
  const preset = findScoringPreset(DEFAULT_SCORING_PRESET_ID)
  if (!preset) throw new Error('既定の採点方式が解決できません')
  const { label: _l, common: _c, note: _n, ...rule } = preset
  return rule
}

// ---------------------------------------------------------------------------
// 操作ログと Undo
// ---------------------------------------------------------------------------

async function writeWithLog(
  d: BadmintonDb,
  tournamentId: string,
  type: OperationType,
  label: string,
  before: OperationPatch[],
  after: OperationPatch[],
): Promise<OperationRecord> {
  let op!: OperationRecord
  await d.transaction('rw', [d.matches, d.entries, d.groups, d.stages, d.events, d.tournaments, d.operations], async () => {
    // 連番はトランザクション内で採る。時刻では同じミリ秒の操作が区別できない。
    const existing = await d.operations.where({ tournamentId }).toArray()
    const seq = existing.reduce((mx, o) => Math.max(mx, o.seq), 0) + 1
    op = {
      id: newId('op'),
      tournamentId,
      seq,
      at: now(),
      type,
      label,
      before,
      after,
      undoable: true,
      undone: false,
    }
    await applyPatches(d, after)
    await d.operations.put(op)
  })
  return op
}

async function applyPatches(d: BadmintonDb, patches: OperationPatch[]): Promise<void> {
  for (const p of patches) {
    const table = d[p.table] as unknown as {
      put: (v: unknown) => Promise<unknown>
      delete: (k: string) => Promise<void>
    }
    if (p.value === null) await table.delete(p.key)
    else await table.put(p.value)
  }
}

/** 直近の取り消せる操作。トーストの「取り消す」が対象にするもの。 */
export async function lastUndoable(
  tournamentId: string,
  d: BadmintonDb = db(),
): Promise<OperationRecord | null> {
  const ops = await d.operations.where({ tournamentId }).toArray()
  const candidates = ops
    .filter((o) => o.undoable && !o.undone)
    .sort((a, b) => b.seq - a.seq)
  return candidates[0] ?? null
}

/**
 * 操作を取り消す。
 *
 * 逆操作を計算せず、**変更前のレコードをそのまま書き戻す**。
 * 大会1つ分のデータが小さいため、この素朴な方法が最も壊れにくい。
 */
export async function undo(
  operationId: string,
  d: BadmintonDb = db(),
): Promise<OperationRecord> {
  const op = await d.operations.get(operationId)
  if (!op) throw new Error(`操作が見つかりません: ${operationId}`)
  if (op.undone) return op

  const updated: OperationRecord = { ...op, undone: true }
  await d.transaction('rw', [d.matches, d.entries, d.groups, d.stages, d.events, d.tournaments, d.operations], async () => {
    await applyPatches(d, op.before)
    await d.operations.put(updated)
  })
  return updated
}

/** 取り消した操作をやり直す。 */
export async function redo(operationId: string, d: BadmintonDb = db()): Promise<OperationRecord> {
  const op = await d.operations.get(operationId)
  if (!op) throw new Error(`操作が見つかりません: ${operationId}`)
  if (!op.undone) return op

  const updated: OperationRecord = { ...op, undone: false }
  await d.transaction('rw', [d.matches, d.entries, d.groups, d.stages, d.events, d.tournaments, d.operations], async () => {
    await applyPatches(d, op.after)
    await d.operations.put(updated)
  })
  return updated
}

// ---------------------------------------------------------------------------
// 順位
// ---------------------------------------------------------------------------

/** 1ブロックの順位を計算する。ドメイン層の純粋関数へ渡すだけ。 */
export async function standings(
  groupId: string,
  d: BadmintonDb = db(),
): Promise<RankingResult> {
  const group = await d.groups.get(groupId)
  if (!group) throw new Error(`組が見つかりません: ${groupId}`)

  const matches = await d.matches.where({ groupId }).toArray()
  const rules = await d.rankingRules.where({ tournamentId: group.tournamentId }).toArray()
  const scoringRules = await d.scoringRules.where({ tournamentId: group.tournamentId }).toArray()
  const t = await d.tournaments.get(group.tournamentId)

  const rule =
    rules.find((r) => r.id === t?.defaultRankingRulePresetId) ?? rules[0] ?? defaultRankingRule()

  const ctx: RankingContext = {
    entryIds: group.entryIds,
    matches,
    rule,
    scoringRules: Object.fromEntries(scoringRules.map((r) => [r.id, r])),
  }
  return rank(ctx, { detectScopeSensitivity: true })
}

/** 未入力の試合を通し番号順に返す。連続入力モードが次に開く試合。 */
export async function nextUnenteredMatch(
  tournamentId: string,
  afterNumber = 0,
  d: BadmintonDb = db(),
): Promise<MatchRecord | null> {
  const all = await d.matches.where({ tournamentId }).toArray()
  const pending = all
    .filter((m) => m.status !== 'COMPLETED')
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  return pending.find((m) => (m.number ?? 0) > afterNumber) ?? pending[0] ?? null
}

/** 通し試合番号から引く。紙のスコアシートからの転記で使う。 */
export async function matchByNumber(
  tournamentId: string,
  number: number,
  d: BadmintonDb = db(),
): Promise<MatchRecord | null> {
  const all = await d.matches.where({ tournamentId, number }).toArray()
  return all[0] ?? null
}
