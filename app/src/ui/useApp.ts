// アプリ全体の状態。DB を読み、画面へ渡す。
//
// 同期もサーバもない。端末内の Dexie だけが正（ADR-0001）。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../store/db'
import {
  addEntries,
  addEvent,
  addStage,
  buildGroups as buildGroupsUseCase,
  buildMatches,
  clearResult as clearResultUseCase,
  createTournament as createTournamentUseCase,
  enterResult as enterResultUseCase,
  lastUndoable,
  standings,
  undo as undoUseCase,
} from '../store/usecases'
import {
  isPublishConfigured,
  publish,
  publishToken,
  viewerUrl,
  type NameVisibility,
} from '../store/publish'
import type { ParsedRow } from './roster'
import { DEFAULT_TEAM_LINEUP_ID, DEFAULT_TEAM_RANKING_PRESET_ID } from '../domain/presets'
import { ensureDemo, resetDemo } from './demo'
import { snapshot } from '../store/db'
import {
  downloadSnapshot,
  fileSaveStatus,
  isFileSaveSupported,
  linkFile,
  requestPersistentStorage,
  suggestedFileName,
  writeSnapshot,
  type FileSaveStatus,
} from '../store/fileSave'
import type {
  EventRecord,
  GroupRecord,
  MatchRecord,
  OperationRecord,
  PlayerRecord,
  ScoringRuleRecord,
  StageRecord,
  StageType,
  TournamentRecord,
} from '../store/schema'
import type { EntryRecord } from '../store/schema'
import type { Game, RankingResult, ResultType } from '../domain/types'

export interface AppData {
  tournament: TournamentRecord
  events: EventRecord[]
  stages: StageRecord[]
  groups: GroupRecord[]
  entries: EntryRecord[]
  players: PlayerRecord[]
  matches: MatchRecord[]
  scoringRules: ScoringRuleRecord[]
}

export interface Toast {
  message: string
  operationId: string | null
}

export function useApp() {
  const [data, setData] = useState<AppData | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<FileSaveStatus>(() => fileSaveStatus())
  const [publishState, setPublishState] = useState<{
    configured: boolean
    publishedAt: string | null
    url: string | null
    error: string | null
    busy: boolean
  }>({ configured: isPublishConfigured(), publishedAt: null, url: null, error: null, busy: false })

  // 容量不足による自動削除から守る。1行で済むので必ず呼ぶ。
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  const load = useCallback(async () => {
    try {
      const d = db()
      // 大会が複数あるとき、**最後に作った／更新したもの**を開く。
      // 先頭を固定で読むと、新しく作った大会が画面に出ない。
      const all = await d.tournaments.toArray()
      const t =
        all.length === 0
          ? await ensureDemo(d)
          : [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      const where = { tournamentId: t.id }
      const [events, stages, groups, entries, players, matches, scoringRules] = await Promise.all([
        d.events.where(where).toArray(),
        d.stages.where(where).toArray(),
        d.groups.where(where).toArray(),
        d.entries.where(where).toArray(),
        d.players.where(where).toArray(),
        d.matches.where(where).toArray(),
        d.scoringRules.where(where).toArray(),
      ])
      setData({
        tournament: t,
        events: events.sort((a, b) => a.order - b.order),
        stages: stages.sort((a, b) => a.order - b.order),
        groups: groups.sort((a, b) => a.order - b.order),
        entries,
        players,
        matches: matches.sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
        scoringRules,
      })
    } catch (e) {
      // 想定外のエラーでも直前の状態を失わない（N-2-5）。
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 保存先のファイルへ書き出す。
   * **失敗しても画面を止めない**（N-2-3）。状態表示だけが変わる。
   */
  const syncFile = useCallback(async (tournamentId: string) => {
    if (!isFileSaveSupported()) return
    try {
      const snap = await snapshot(tournamentId)
      await writeSnapshot(snap)
    } catch {
      // 握りつぶす。保存先が未設定なら何もしない。
    }
    setSaveState(fileSaveStatus())
  }, [])

  const enterResult = useCallback(
    async (matchId: string, games: Game[], resultType: ResultType = 'NORMAL') => {
      const { operation } = await enterResultUseCase({ matchId, games, resultType })
      await load()
      setToast({ message: operation.label, operationId: operation.id })
      const d = db()
      const m = await d.matches.get(matchId)
      if (m) void syncFile(m.tournamentId)
    },
    [load, syncFile],
  )

  /**
   * 棄権を記録する。
   *
   * 運営者に「不戦勝」と「途中棄権」を選ばせない。**スコアが入っているかで決まる**。
   * 入っていなければ不戦勝、入っていれば途中棄権。要項上の扱いも実際そうなっている。
   *
   * 実データ（愛知社会人リーグ 355対戦中45件、新人戦 925試合中38件）では
   * 棄権は1割前後で起きる。例外処理ではなく日常の操作として置く。
   */
  const enterRetirement = useCallback(
    async (matchId: string, side: 'A' | 'B' | 'BOTH') => {
      const d = db()
      const m = await d.matches.get(matchId)
      if (!m) return
      const [a, b] = m.entryIds
      const played = m.games.length > 0

      const input =
        side === 'BOTH'
          ? { matchId, games: [], resultType: 'DOUBLE_WALKOVER' as const, winnerEntryId: null }
          : {
              matchId,
              // 途中棄権は、そこまでのスコアを残す。不戦勝はスコアを持たない。
              games: played ? m.games : [],
              resultType: (played ? 'RETIRED' : 'WALKOVER') as ResultType,
              retiredEntryId: side === 'A' ? a : b,
              // **自動判定に任せない。**途中棄権のスコアは通常の勝敗判定では決着しない。
              winnerEntryId: side === 'A' ? b : a,
            }

      const { operation } = await enterResultUseCase(input)
      await load()
      setToast({ message: operation.label, operationId: operation.id })
      void syncFile(m.tournamentId)
    },
    [load, syncFile],
  )

  /** 保存先を選ぶ。1回だけ。以降は黙って上書きする。 */
  const chooseFile = useCallback(async () => {
    if (!data) return
    const ok = await linkFile(suggestedFileName(data.tournament.name, data.tournament.date))
    setSaveState(fileSaveStatus())
    if (ok) {
      await syncFile(data.tournament.id)
      setToast({ message: 'ファイルに自動保存します', operationId: null })
    }
  }, [data, syncFile])

  /** File System Access API が使えない環境向け。 */
  const exportFile = useCallback(async () => {
    if (!data) return
    const snap = await snapshot(data.tournament.id)
    downloadSnapshot(snap, suggestedFileName(data.tournament.name, data.tournament.date))
    setToast({ message: '書き出しました', operationId: null })
  }, [data])

  const clearResult = useCallback(
    async (matchId: string) => {
      const { operation } = await clearResultUseCase(matchId)
      await load()
      setToast({ message: operation.label, operationId: operation.id })
    },
    [load],
  )

  const undo = useCallback(
    async (operationId: string) => {
      await undoUseCase(operationId)
      await load()
      setToast({ message: '取り消しました', operationId: null })
    },
    [load],
  )

  const undoLast = useCallback(async () => {
    if (!data) return
    const op: OperationRecord | null = await lastUndoable(data.tournament.id)
    if (op) await undo(op.id)
  }, [data, undo])

  const reset = useCallback(async () => {
    await resetDemo()
    await load()
    setToast({ message: 'デモを作り直しました', operationId: null })
  }, [load])

  // -------------------------------------------------------------------------
  // 大会作成〜組合せ
  // -------------------------------------------------------------------------

  const setupActions = useMemo(
    () => ({
      createTournament: async (v: {
        name: string
        date: string
        venue: string
        courtCount: number
        scoringPresetId: string
        rankingPresetId: string
      }) => {
        const t = await createTournamentUseCase(v)
        await load()
        return t
      },
      addEventWithStage: async (
        tournamentId: string,
        name: string,
        female: boolean,
        opts: { team?: boolean; teamLineupId?: string; stageType?: StageType } = {},
      ) => {
        const single = name.includes('シングル')
        const stageType = opts.stageType ?? 'ROUND_ROBIN'
        const event = await addEvent(
          tournamentId,
          {
            name,
            discipline: opts.team ? 'TEAM' : single ? (female ? 'WS' : 'MS') : female ? 'WD' : 'MD',
            category: '',
            entryType: opts.team ? 'TEAM' : single ? 'INDIVIDUAL' : 'PAIR',
            teamLineupId: opts.team ? (opts.teamLineupId ?? DEFAULT_TEAM_LINEUP_ID) : null,
            scoringRuleId: null,
            // 団体戦向けの既定は addEvent 側で入る。ここでは指定しない。
            rankingRulePresetId: null,
          },
          db(),
        )
        const stage = await addStage(
          tournamentId,
          event.id,
          {
            name: stageType === 'SINGLE_ELIMINATION' ? 'トーナメント' : 'ブロック戦',
            type: stageType,
            options: stageType === 'SINGLE_ELIMINATION' ? { drawSeed: Date.now() % 100000 } : {},
          },
          db(),
        )
        await load()
        return { event, stage }
      },

      /** 種目の進め方と組み方を変える。**組合せを作る前だけ**許す。 */
      updateEventFormat: async (
        eventId: string,
        patch: { teamLineupId?: string | null; stageType?: StageType },
      ) => {
        const d = db()
        const ev = await d.events.get(eventId)
        if (!ev) return
        if (patch.teamLineupId !== undefined) {
          const team = patch.teamLineupId !== null
          await d.events.put({
            ...ev,
            teamLineupId: patch.teamLineupId,
            entryType: team ? 'TEAM' : ev.name.includes('シングル') ? 'INDIVIDUAL' : 'PAIR',
            discipline: team ? 'TEAM' : ev.discipline === 'TEAM' ? 'MD' : ev.discipline,
            // 個人戦へ戻したら大会の既定に、団体戦にしたら団体戦の既定に。
            rankingRulePresetId: team ? DEFAULT_TEAM_RANKING_PRESET_ID : null,
          })
        }
        if (patch.stageType !== undefined) {
          const stages = await d.stages.where({ eventId }).toArray()
          for (const st of stages) {
            await d.stages.put({
              ...st,
              type: patch.stageType,
              name: patch.stageType === 'SINGLE_ELIMINATION' ? 'トーナメント' : 'ブロック戦',
              options:
                patch.stageType === 'SINGLE_ELIMINATION'
                  ? { ...st.options, drawSeed: st.options.drawSeed ?? Date.now() % 100000 }
                  : st.options,
            })
          }
        }
        await load()
      },
      importRoster: async (eventId: string, rows: ParsedRow[]) => {
        const d = db()
        const ev = await d.events.get(eventId)
        if (!ev) throw new Error('種目が見つかりません')
        await addEntries(
          ev.tournamentId,
          eventId,
          rows.map((r) => ({
            playerNames: r.playerNames,
            affiliation: r.affiliation,
            seed: r.seed,
          })),
          d,
        )
        await load()
      },
      buildGroups: async (stageKey: string, opts: { perGroup: number; drawSeed: number }) => {
        const d = db()
        // SetupScreen は `stage:<eventId>` の形で渡してくる。
        const eventId = stageKey.startsWith('stage:') ? stageKey.slice(6) : null
        const stage = eventId
          ? (await d.stages.where({ eventId }).toArray())[0]
          : await d.stages.get(stageKey)
        if (!stage) throw new Error('ステージが見つかりません')
        const gs = await buildGroupsUseCase(
          { stageId: stage.id, perGroup: opts.perGroup, drawSeed: opts.drawSeed, separateSameAffiliation: true },
          d,
        )
        await load()
        return gs
      },
      buildSchedule: async (opts: { courtCount: number; startTime: string; slotMinutes: number }) => {
        const d = db()
        const all = await d.tournaments.toArray()
        if (all.length === 0) throw new Error('大会がありません')
        await buildMatches(all[0].id, opts, d)
        await load()
      },
    }),
    [load],
  )

  // -------------------------------------------------------------------------
  // 速報の公開
  // -------------------------------------------------------------------------

  /**
   * 公開する。**失敗しても画面を止めない**（UX原則6）。
   * 状態表示が変わるだけで、運営は続く。
   */
  const publishNow = useCallback(
    async (nameVisibility: NameVisibility = 'FULL') => {
      if (!data) return
      setPublishState((s) => ({ ...s, busy: true }))
      try {
        const snap = await snapshot(data.tournament.id)
        await publish(snap, { nameVisibility })
        publishToken(data.tournament.id)
        setPublishState({
          configured: true,
          publishedAt: new Date().toISOString(),
          url: viewerUrl(data.tournament.id),
          error: null,
          busy: false,
        })
        setToast({ message: '速報を公開しました', operationId: null })
      } catch (e) {
        setPublishState((s) => ({
          ...s,
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        }))
      }
    },
    [data],
  )

  const getStandings = useCallback(
    (groupId: string): Promise<RankingResult> => standings(groupId),
    [],
  )

  return {
    data,
    toast,
    setToast,
    error,
    saveState,
    enterResult,
    enterRetirement,
    clearResult,
    undo,
    undoLast,
    reset,
    chooseFile,
    exportFile,
    getStandings,
    setupActions,
    publishState,
    publishNow,
    reload: load,
  }
}

// ---------------------------------------------------------------------------
// 表示用の派生データ
// ---------------------------------------------------------------------------

export function useIndexes(data: AppData | null) {
  return useMemo(() => {
    if (!data) return null
    const playerById = new Map(data.players.map((p) => [p.id, p]))
    const entryById = new Map(data.entries.map((e) => [e.id, e]))
    const groupById = new Map(data.groups.map((g) => [g.id, g]))
    const eventById = new Map(data.events.map((e) => [e.id, e]))
    const ruleById = new Map(data.scoringRules.map((r) => [r.id, r]))

    const entryLabel = (entryId: string | null): string => {
      if (!entryId) return '—'
      const e = entryById.get(entryId)
      if (!e) return '—'
      if (e.teamName) return e.teamName
      const names = e.playerIds.map((id) => playerById.get(id)?.name ?? '').filter(Boolean)
      return names.join(' / ')
    }
    const entryAffiliation = (entryId: string | null): string => {
      if (!entryId) return ''
      return entryById.get(entryId)?.affiliation ?? ''
    }
    const blockLabel = (groupId: string | null): string => {
      if (!groupId) return ''
      const g = groupById.get(groupId)
      if (!g) return ''
      const ev = eventById.get(g.eventId)
      return `${ev?.name ?? ''} ${g.name}`.trim()
    }
    return { playerById, entryById, groupById, eventById, ruleById, entryLabel, entryAffiliation, blockLabel }
  }, [data])
}

export type Indexes = NonNullable<ReturnType<typeof useIndexes>>

/** 丸数字。星取表のマスに入るブロック内番号。 */
export function circled(n: number | null): string {
  if (n === null || n < 1) return ''
  if (n <= 20) return String.fromCharCode(0x2460 + n - 1)
  return `(${n})`
}
