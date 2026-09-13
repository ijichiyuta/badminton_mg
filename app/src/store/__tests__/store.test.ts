// 永続化層とユースケースのテスト。
// 「データを失わない」が最優先の非機能要件（docs/08）なので、
// 永続化・Undo・エクスポート／インポートを厚く検証する。

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BadmintonDb, listBackups, restore, restoreBackup, snapshot, takeBackup, useDb } from '../db'
import {
  addEntries,
  addEvent,
  addStage,
  buildGroups,
  buildMatches,
  clearResult,
  createTournament,
  effectiveScoringRuleId,
  enterResult,
  lastUndoable,
  matchByNumber,
  nextUnenteredMatch,
  redo,
  standings,
  undo,
} from '../usecases'
import type { EventRecord, GroupRecord, StageRecord, TournamentRecord } from '../schema'
import { SCHEMA_VERSION } from '../schema'

let d: BadmintonDb
let dbIndex = 0

const SCHEDULE = { courtCount: 6, startTime: '9:30', slotMinutes: 30 }

beforeEach(async () => {
  dbIndex += 1
  d = new BadmintonDb(`test-${dbIndex}`)
  useDb(d)
  await d.open()
})

/** 4組×2ブロックの小さな大会を作る。 */
async function setupTournament(entryCount = 8) {
  const t = await createTournament(
    { name: 'テスト大会', date: '2026-09-06', courtCount: 6, venue: '昭和スポーツセンター' },
    d,
  )
  const ev = await addEvent(
    t.id,
    { name: '男子ダブルス1部', discipline: 'MD', category: '1部', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null },
    d,
  )
  const st = await addStage(t.id, ev.id, { name: '予選リーグ', type: 'ROUND_ROBIN' }, d)
  await addEntries(
    t.id,
    ev.id,
    Array.from({ length: entryCount }, (_, i) => ({
      playerNames: [`選手${i * 2 + 1}`, `選手${i * 2 + 2}`],
      affiliation: `クラブ${i}`,
    })),
    d,
  )
  const groups = await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
  const matches = await buildMatches(t.id, SCHEDULE, d)
  return { t, ev, st, groups, matches }
}

// ---------------------------------------------------------------------------

describe('大会の作成', () => {
  it('大会・採点方式・順位決定ルールが同時に保存される', async () => {
    const t = await createTournament({ name: '第64回', date: '2026-09-06', courtCount: 6 }, d)
    expect(await d.tournaments.get(t.id)).toBeTruthy()
    expect(await d.scoringRules.where({ tournamentId: t.id }).count()).toBe(1)
    expect(await d.rankingRules.where({ tournamentId: t.id }).count()).toBe(1)
  })

  it('コート数ぶんのコートが作られる', async () => {
    const t = await createTournament({ name: 'x', date: '2026-09-06', courtCount: 6 }, d)
    expect(t.courts).toHaveLength(6)
    expect(t.courts[0].name).toBe('1番コート')
  })

  it('既定の採点方式は15点制', async () => {
    const t = await createTournament({ name: 'x', date: '2026-09-06', courtCount: 6 }, d)
    const rule = await d.scoringRules.get(t.defaultScoringRuleId)
    expect(rule?.pointsPerGame).toBe(15)
  })

  it('採点プリセットを指定できる（上限17は要項どおり）', async () => {
    const t = await createTournament(
      { name: 'x', date: '2026-09-06', courtCount: 6, scoringPresetId: '15pt-3g-cap17' },
      d,
    )
    const rule = await d.scoringRules.get(t.defaultScoringRuleId)
    expect(rule?.maxPoints).toBe(17)
  })

  it('端末内データにパスワードをかけない', async () => {
    const t = await createTournament({ name: 'x', date: '2026-09-06', courtCount: 6 }, d)
    expect(t.publicToken).toBeNull()
  })
})

describe('採点方式の継承', () => {
  const t = { defaultScoringRuleId: 'T' } as TournamentRecord
  const ev = { scoringRuleId: null } as EventRecord
  const st = { scoringRuleId: null } as StageRecord
  const g = { scoringRuleId: null } as GroupRecord

  it('何も上書きしなければ大会の既定値', () => {
    expect(effectiveScoringRuleId(t, ev, st, g)).toBe('T')
  })
  it('種目の上書きが効く', () => {
    expect(effectiveScoringRuleId(t, { ...ev, scoringRuleId: 'E' }, st, g)).toBe('E')
  })
  it('ステージの上書きが種目より優先される', () => {
    expect(effectiveScoringRuleId(t, { ...ev, scoringRuleId: 'E' }, { ...st, scoringRuleId: 'S' }, g)).toBe('S')
  })
  it('ブロックの上書きが最優先', () => {
    expect(
      effectiveScoringRuleId(t, { ...ev, scoringRuleId: 'E' }, { ...st, scoringRuleId: 'S' }, { ...g, scoringRuleId: 'G' }),
    ).toBe('G')
  })
})

describe('参加者と組合せ', () => {
  it('8組を4組ずつ2ブロックに分ける', async () => {
    const { groups } = await setupTournament(8)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.entryIds.length)).toEqual([4, 4])
    expect(groups.map((g) => g.name)).toEqual(['A組', 'B組'])
  })

  it('ペアは選手2名を持つ', async () => {
    const { t } = await setupTournament(8)
    const entries = await d.entries.where({ tournamentId: t.id }).toArray()
    expect(entries[0].playerIds).toHaveLength(2)
    expect(await d.players.where({ tournamentId: t.id }).count()).toBe(16)
  })

  it('抽選をやり直すと古い組と試合が消える', async () => {
    const { t, st } = await setupTournament(8)
    const before = await d.matches.where({ tournamentId: t.id }).count()
    expect(before).toBeGreaterThan(0)

    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 999 }, d)
    expect(await d.groups.where({ stageId: st.id }).count()).toBe(2)
    expect(await d.matches.where({ stageId: st.id }).count()).toBe(0)
  })

  it('同じシードなら同じ組分けになる', async () => {
    const { st } = await setupTournament(8)
    const a = await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 7 }, d)
    const b = await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 7 }, d)
    expect(a.map((g) => g.entryIds)).toEqual(b.map((g) => g.entryIds))
  })
})

describe('試合の採番', () => {
  it('4組×2ブロックで12試合', async () => {
    const { matches } = await setupTournament(8)
    expect(matches).toHaveLength(12)
  })

  it('通し番号が1から連番になる', async () => {
    const { matches } = await setupTournament(8)
    expect(matches.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('ブロック内番号がブロックごとに1から振られる', async () => {
    const { matches, groups } = await setupTournament(8)
    const a = matches.filter((m) => m.groupId === groups[0].id).map((m) => m.numberInGroup)
    expect(a.sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('初期状態は READY で結果を持たない', async () => {
    const { matches } = await setupTournament(8)
    expect(matches.every((m) => m.status === 'READY')).toBe(true)
    expect(matches.every((m) => m.winnerEntryId === null)).toBe(true)
  })

  it('通し番号から引ける（紙からの転記）', async () => {
    const { t } = await setupTournament(8)
    const m = await matchByNumber(t.id, 5, d)
    expect(m?.number).toBe(5)
  })
})

describe('結果入力', () => {
  it('勝者がスコアから自動判定される', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string; entryIds: (string | null)[] }
    const { match } = await enterResult(
      { matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 11 }] },
      d,
    )
    expect(match.winnerEntryId).toBe(m.entryIds[0])
    expect(match.status).toBe('COMPLETED')
  })

  it('即時に永続化される。保存ボタンに依存しない', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    const reloaded = await d.matches.get(m.id)
    expect(reloaded?.status).toBe('COMPLETED')
  })

  it('決着していなければ COMPLETED にしない', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    const { match } = await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }] }, d)
    expect(match.status).not.toBe('COMPLETED')
    expect(match.winnerEntryId).toBeNull()
  })

  it('NOT_PLAYED だけが勝者を持たない COMPLETED になる', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    const { match } = await enterResult({ matchId: m.id, games: [], resultType: 'NOT_PLAYED' }, d)
    expect(match.status).toBe('COMPLETED')
    expect(match.winnerEntryId).toBeNull()
  })

  it('没収試合には勝者が存在する', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string; entryIds: (string | null)[] }
    const { match } = await enterResult(
      {
        matchId: m.id,
        games: [],
        resultType: 'WALKOVER',
        winnerEntryId: m.entryIds[0],
        retiredEntryId: m.entryIds[1],
      },
      d,
    )
    expect(match.status).toBe('COMPLETED')
    expect(match.winnerEntryId).toBe(m.entryIds[0])
  })

  it('上限17の設定では 16-14 が決着として扱われる', async () => {
    const t = await createTournament(
      { name: 'x', date: '2026-09-06', courtCount: 6, scoringPresetId: '15pt-3g-cap17' },
      d,
    )
    const ev = await addEvent(t.id, { name: 'MD', discipline: 'MD', category: '', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null }, d)
    const st = await addStage(t.id, ev.id, { name: '予選', type: 'ROUND_ROBIN' }, d)
    await addEntries(t.id, ev.id, Array.from({ length: 4 }, (_, i) => ({ playerNames: [`p${i}`] })), d)
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    await buildMatches(t.id, SCHEDULE, d)

    const m = (await matchByNumber(t.id, 1, d)) as { id: string; entryIds: (string | null)[] }
    const { match } = await enterResult(
      { matchId: m.id, games: [{ scoreA: 16, scoreB: 14 }, { scoreA: 15, scoreB: 9 }] },
      d,
    )
    expect(match.winnerEntryId).toBe(m.entryIds[0])
  })
})

describe('Undo — 確認ダイアログではなく取り消しで守る', () => {
  it('入力を取り消すと未入力に戻る', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    const { operation } = await enterResult(
      { matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] },
      d,
    )
    await undo(operation.id, d)

    const reloaded = await d.matches.get(m.id)
    expect(reloaded?.status).toBe('READY')
    expect(reloaded?.games).toEqual([])
    expect(reloaded?.winnerEntryId).toBeNull()
  })

  it('取り消した操作をやり直せる', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    const { operation } = await enterResult(
      { matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] },
      d,
    )
    await undo(operation.id, d)
    await redo(operation.id, d)
    expect((await d.matches.get(m.id))?.status).toBe('COMPLETED')
  })

  it('直近の取り消せる操作が引ける（トーストの対象）', async () => {
    const { t } = await setupTournament(8)
    const m1 = (await matchByNumber(t.id, 1, d)) as { id: string }
    const m2 = (await matchByNumber(t.id, 2, d)) as { id: string }
    await enterResult({ matchId: m1.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    const second = await enterResult({ matchId: m2.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)

    const last = await lastUndoable(t.id, d)
    expect(last?.id).toBe(second.operation.id)
  })

  it('同じミリ秒に連続入力しても順序が保たれる', async () => {
    const { t, matches } = await setupTournament(8)
    const ops = []
    for (const m of matches.slice(0, 5)) {
      ops.push((await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)).operation)
    }
    expect(ops.map((o) => o.seq)).toEqual([1, 2, 3, 4, 5])
    const last = await lastUndoable(t.id, d)
    expect(last?.id).toBe(ops[4].id)
  })

  it('取り消し済みの操作は候補に出ない', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    const { operation } = await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    await undo(operation.id, d)
    expect(await lastUndoable(t.id, d)).toBeNull()
  })

  it('操作ラベルがそのままトーストに出せる', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    const { operation } = await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    expect(operation.label).toBe('第1試合を記録しました')
  })

  it('clearResult も取り消せる', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    const { operation } = await clearResult(m.id, d)
    expect((await d.matches.get(m.id))?.status).toBe('READY')
    await undo(operation.id, d)
    expect((await d.matches.get(m.id))?.status).toBe('COMPLETED')
  })
})

describe('連続入力モード', () => {
  it('次の未入力試合を返す', async () => {
    const { t } = await setupTournament(8)
    const first = await nextUnenteredMatch(t.id, 0, d)
    expect(first?.number).toBe(1)

    await enterResult({ matchId: (first as { id: string }).id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    const next = await nextUnenteredMatch(t.id, 1, d)
    expect(next?.number).toBe(2)
  })

  it('末尾まで来たら先頭の未入力に戻る', async () => {
    const { t, matches } = await setupTournament(8)
    for (const m of matches.slice(1)) {
      await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    }
    const next = await nextUnenteredMatch(t.id, 99, d)
    expect(next?.number).toBe(1)
  })

  it('全部入力し終えたら null', async () => {
    const { t, matches } = await setupTournament(8)
    for (const m of matches) {
      await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    }
    expect(await nextUnenteredMatch(t.id, 0, d)).toBeNull()
  })
})

describe('順位', () => {
  it('リーグ途中は暫定として返る', async () => {
    const { groups } = await setupTournament(8)
    const r = await standings(groups[0].id, d)
    expect(r.provisional).toBe(true)
  })

  it('全試合を入れると確定する', async () => {
    const { groups, matches } = await setupTournament(8)
    const target = matches.filter((m) => m.groupId === groups[0].id)
    for (const m of target) {
      await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    }
    const r = await standings(groups[0].id, d)
    expect(r.provisional).toBe(false)
    expect(r.entries).toHaveLength(4)
    expect(r.entries[0].reason).toContain('勝')
  })

  it('結果を取り消すと暫定に戻る', async () => {
    const { groups, matches } = await setupTournament(8)
    const target = matches.filter((m) => m.groupId === groups[0].id)
    const ops = []
    for (const m of target) {
      ops.push((await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)).operation)
    }
    expect((await standings(groups[0].id, d)).provisional).toBe(false)
    await undo(ops[0].id, d)
    expect((await standings(groups[0].id, d)).provisional).toBe(true)
  })
})

describe('エクスポートとインポート', () => {
  it('スナップショットに全テーブルが入る', async () => {
    const { t } = await setupTournament(8)
    const snap = await snapshot(t.id, d)
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION)
    expect(snap.tournament.id).toBe(t.id)
    expect(snap.events).toHaveLength(1)
    expect(snap.groups).toHaveLength(2)
    expect(snap.entries).toHaveLength(8)
    expect(snap.matches).toHaveLength(12)
  })

  it('別のDBへ取り込んでも同じ状態になる', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    const snap = await snapshot(t.id, d)

    const other = new BadmintonDb('test-restore')
    await other.open()
    const r = await restore(snap, other)

    expect(r.tournamentId).toBe(t.id)
    expect(await other.matches.where({ tournamentId: t.id }).count()).toBe(12)
    expect((await other.matches.get(m.id))?.status).toBe('COMPLETED')
    await other.delete()
  })

  it('未知のバージョンでも拒否せず警告して読む', async () => {
    const { t } = await setupTournament(8)
    const snap = await snapshot(t.id, d)
    const other = new BadmintonDb('test-version')
    await other.open()

    const r = await restore({ ...snap, schemaVersion: 99 }, other)
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(await other.matches.where({ tournamentId: t.id }).count()).toBe(12)
    await other.delete()
  })

  it('壊れたデータはエラーにする', async () => {
    const other = new BadmintonDb('test-broken')
    await other.open()
    await expect(
      restore({ schemaVersion: 2, exportedAt: '', tournament: {} } as never, other),
    ).rejects.toThrow()
    await other.delete()
  })

  it('取り込みは既存データを置き換える（重複しない）', async () => {
    const { t } = await setupTournament(8)
    const snap = await snapshot(t.id, d)
    await restore(snap, d)
    await restore(snap, d)
    expect(await d.matches.where({ tournamentId: t.id }).count()).toBe(12)
  })
})

describe('バックアップ', () => {
  it('世代バックアップを取れる', async () => {
    const { t } = await setupTournament(8)
    await takeBackup(t.id, 'AUTO', d)
    await takeBackup(t.id, 'MANUAL', d)
    const list = await listBackups(t.id, d)
    expect(list).toHaveLength(2)
    expect(list[0].sizeBytes).toBeGreaterThan(0)
  })

  it('バックアップから復元できる', async () => {
    const { t } = await setupTournament(8)
    const m = (await matchByNumber(t.id, 1, d)) as { id: string }
    await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 2 }] }, d)
    const bk = await takeBackup(t.id, 'MANUAL', d)

    await clearResult(m.id, d)
    expect((await d.matches.get(m.id))?.status).toBe('READY')

    await restoreBackup(bk.id, d)
    expect((await d.matches.get(m.id))?.status).toBe('COMPLETED')
  })

  it('同じミリ秒に連続して取っても上書きされない', async () => {
    const { t } = await setupTournament(8)
    const a = await takeBackup(t.id, 'AUTO', d)
    const b = await takeBackup(t.id, 'AUTO', d)
    expect(a.id).not.toBe(b.id)
    expect(b.seq).toBe(a.seq + 1)
    expect(await listBackups(t.id, d)).toHaveLength(2)
  })

  it('世代数を超えたら古いものから消える', async () => {
    const { t } = await setupTournament(8)
    for (let i = 0; i < 25; i++) await takeBackup(t.id, 'AUTO', d)
    expect((await listBackups(t.id, d)).length).toBeLessThanOrEqual(20)
  })
})
