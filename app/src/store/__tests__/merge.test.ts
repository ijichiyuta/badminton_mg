// 複数端末の合流のテスト。
// 担当が重なっていなければ衝突は起きない、という前提が成り立つかを確かめる。

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BadmintonDb, snapshot, useDb } from '../db'
import {
  addEntries,
  addEvent,
  addStage,
  buildGroups,
  buildMatches,
  createTournament,
  enterResult,
} from '../usecases'
import { mergeSnapshots, unassignedGroups, validateAssignments } from '../merge'
import type { TournamentSnapshot } from '../schema'

let d: BadmintonDb
let n = 0

const SCHEDULE = { courtCount: 6, startTime: '9:30', slotMinutes: 30 }

beforeEach(async () => {
  n += 1
  d = new BadmintonDb(`merge-${n}`)
  useDb(d)
  await d.open()
})

/** 2ブロック（A組・B組）の大会を作る。 */
async function setup() {
  const t = await createTournament({ name: 'テスト', date: '2026-09-06', courtCount: 6 }, d)
  const ev = await addEvent(
    t.id,
    { name: 'MD', discipline: 'MD', category: '', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null },
    d,
  )
  const st = await addStage(t.id, ev.id, { name: '予選', type: 'ROUND_ROBIN' }, d)
  await addEntries(t.id, ev.id, Array.from({ length: 8 }, (_, i) => ({ playerNames: [`p${i}`] })), d)
  const groups = await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
  const matches = await buildMatches(t.id, SCHEDULE, d)
  return { t, groups, matches }
}

const WIN = [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }]
const LOSS = [{ scoreA: 9, scoreB: 15 }, { scoreA: 2, scoreB: 15 }]

// ---------------------------------------------------------------------------

describe('担当が分かれていれば衝突しない', () => {
  it('A組を端末A、B組を端末Bが入力して合流できる', async () => {
    const { t, groups, matches } = await setup()

    // 端末A：A組だけ入力
    const aMatches = matches.filter((m) => m.groupId === groups[0].id)
    for (const m of aMatches) await enterResult({ matchId: m.id, games: WIN }, d)
    const snapA = await snapshot(t.id, d)

    // 端末B：同じ大会データから始めて、B組だけ入力
    const other = new BadmintonDb('merge-device-b')
    await other.open()
    const { restore } = await import('../db')
    // 端末Bは組合せ確定直後の状態を受け取っている想定
    const clean: TournamentSnapshot = {
      ...snapA,
      matches: snapA.matches.map((m) =>
        m.groupId === groups[0].id
          ? { ...m, games: [], status: 'READY' as const, winnerEntryId: null, completedAt: null }
          : m,
      ),
      operations: [],
    }
    await restore(clean, other)
    const bMatches = (await other.matches.where({ groupId: groups[1].id }).toArray()).sort(
      (x, y) => (x.number ?? 0) - (y.number ?? 0),
    )
    for (const m of bMatches) await enterResult({ matchId: m.id, games: WIN }, other)
    const snapB = await snapshot(t.id, other)

    // 合流
    const r = mergeSnapshots(snapA, snapB)
    expect(r.conflicts).toEqual([])
    expect(r.applied).toBe(bMatches.length)
    expect(r.merged.matches.filter((m) => m.status === 'COMPLETED')).toHaveLength(matches.length)
    await other.delete()
  })
})

describe('両方が同じ試合を入力した場合', () => {
  it('内容が同じなら衝突にしない', async () => {
    const { t, matches } = await setup()
    await enterResult({ matchId: matches[0].id, games: WIN }, d)
    const snapA = await snapshot(t.id, d)
    const r = mergeSnapshots(snapA, snapA)
    expect(r.conflicts).toEqual([])
  })

  it('内容が違えば衝突として返す', async () => {
    const { t, matches } = await setup()
    await enterResult({ matchId: matches[0].id, games: WIN }, d)
    const snapA = await snapshot(t.id, d)

    const snapB: TournamentSnapshot = {
      ...snapA,
      matches: snapA.matches.map((m) =>
        m.id === matches[0].id
          ? { ...m, games: LOSS, winnerEntryId: m.entryIds[1], completedAt: '2026-09-06T10:00:00Z' }
          : m,
      ),
    }

    const r = mergeSnapshots(snapA, snapB)
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0].matchNumber).toBe(matches[0].number)
    expect(r.conflicts[0].reason).toBe('BOTH_EDITED')
  })

  it('衝突しても止まらず、新しいほうを仮に採る', async () => {
    const { t, matches } = await setup()
    await enterResult({ matchId: matches[0].id, games: WIN }, d)
    const snapA = await snapshot(t.id, d)
    const snapB: TournamentSnapshot = {
      ...snapA,
      matches: snapA.matches.map((m) =>
        m.id === matches[0].id
          ? { ...m, games: LOSS, winnerEntryId: m.entryIds[1], completedAt: '2099-01-01T00:00:00Z' }
          : m,
      ),
    }
    const r = mergeSnapshots(snapA, snapB)
    const m = r.merged.matches.find((x) => x.id === matches[0].id)
    expect(m?.games).toEqual(LOSS)
  })
})

describe('片方だけが入力している場合', () => {
  it('相手だけが入力していれば取り込む', async () => {
    const { t, matches } = await setup()
    const empty = await snapshot(t.id, d)
    await enterResult({ matchId: matches[0].id, games: WIN }, d)
    const filled = await snapshot(t.id, d)

    const r = mergeSnapshots(empty, filled)
    expect(r.applied).toBe(1)
    expect(r.merged.matches.find((m) => m.id === matches[0].id)?.status).toBe('COMPLETED')
  })

  it('手元だけが入力していれば相手の空を上書きしない', async () => {
    const { t, matches } = await setup()
    const empty = await snapshot(t.id, d)
    await enterResult({ matchId: matches[0].id, games: WIN }, d)
    const filled = await snapshot(t.id, d)

    const r = mergeSnapshots(filled, empty)
    expect(r.applied).toBe(0)
    expect(r.merged.matches.find((m) => m.id === matches[0].id)?.status).toBe('COMPLETED')
  })
})

describe('操作ログは両方を残す', () => {
  it('重複を除いて連番順に並ぶ', async () => {
    const { t, matches } = await setup()
    await enterResult({ matchId: matches[0].id, games: WIN }, d)
    const a = await snapshot(t.id, d)
    await enterResult({ matchId: matches[1].id, games: WIN }, d)
    const b = await snapshot(t.id, d)

    const r = mergeSnapshots(a, b)
    expect(r.merged.operations).toHaveLength(2)
    expect(r.merged.operations.map((o) => o.seq)).toEqual([1, 2])
  })
})

describe('安全装置', () => {
  it('別の大会は合流できない', async () => {
    const { t } = await setup()
    const a = await snapshot(t.id, d)
    const b: TournamentSnapshot = { ...a, tournament: { ...a.tournament, id: 'other' } }
    expect(() => mergeSnapshots(a, b)).toThrow()
  })

  it('組合せが食い違っていれば警告する', async () => {
    const { t } = await setup()
    const a = await snapshot(t.id, d)
    const b: TournamentSnapshot = { ...a, matches: a.matches.slice(1) }
    expect(mergeSnapshots(a, b).warnings.length).toBeGreaterThan(0)
  })
})

describe('担当の割当', () => {
  it('重なっていなければ警告しない', () => {
    expect(
      validateAssignments([
        { deviceId: 'a', label: 'メイン', groupIds: ['g1', 'g2'] },
        { deviceId: 'b', label: 'サブ', groupIds: ['g3'] },
      ]),
    ).toEqual([])
  })

  it('重なっていれば警告する', () => {
    const w = validateAssignments([
      { deviceId: 'a', label: 'メイン', groupIds: ['g1', 'g2'] },
      { deviceId: 'b', label: 'サブ', groupIds: ['g2'] },
    ])
    expect(w.length).toBeGreaterThan(0)
  })

  it('誰も担当していないブロックを検出する', () => {
    expect(
      unassignedGroups(['g1', 'g2', 'g3'], [{ deviceId: 'a', label: 'メイン', groupIds: ['g1'] }]),
    ).toEqual(['g2', 'g3'])
  })
})
