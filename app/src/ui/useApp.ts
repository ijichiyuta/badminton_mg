// アプリ全体の状態。DB を読み、画面へ渡す。
//
// 同期もサーバもない。端末内の Dexie だけが正（ADR-0001）。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../store/db'
import {
  clearResult as clearResultUseCase,
  enterResult as enterResultUseCase,
  lastUndoable,
  standings,
  undo as undoUseCase,
} from '../store/usecases'
import { ensureDemo, resetDemo } from './demo'
import type {
  EventRecord,
  GroupRecord,
  MatchRecord,
  OperationRecord,
  PlayerRecord,
  ScoringRuleRecord,
  TournamentRecord,
} from '../store/schema'
import type { EntryRecord } from '../store/schema'
import type { Game, RankingResult, ResultType } from '../domain/types'

export interface AppData {
  tournament: TournamentRecord
  events: EventRecord[]
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

  const load = useCallback(async () => {
    try {
      const d = db()
      const t = await ensureDemo(d)
      const where = { tournamentId: t.id }
      const [events, groups, entries, players, matches, scoringRules] = await Promise.all([
        d.events.where(where).toArray(),
        d.groups.where(where).toArray(),
        d.entries.where(where).toArray(),
        d.players.where(where).toArray(),
        d.matches.where(where).toArray(),
        d.scoringRules.where(where).toArray(),
      ])
      setData({
        tournament: t,
        events: events.sort((a, b) => a.order - b.order),
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

  const enterResult = useCallback(
    async (matchId: string, games: Game[], resultType: ResultType = 'NORMAL') => {
      const { operation } = await enterResultUseCase({ matchId, games, resultType })
      await load()
      setToast({ message: operation.label, operationId: operation.id })
    },
    [load],
  )

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

  const getStandings = useCallback(
    (groupId: string): Promise<RankingResult> => standings(groupId),
    [],
  )

  return { data, toast, setToast, error, enterResult, clearResult, undo, undoLast, reset, getStandings, reload: load }
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
