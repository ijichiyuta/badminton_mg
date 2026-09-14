// 団体戦の通し。愛知県社会人クラブリーグと同じ形を、画面が呼ぶのと同じ経路で作る。
//
// ドメイン層の検証（aichi-*.test.ts）は Match を手で組み立てていた。
// こちらは **createTournament → addEvent → buildGroups → buildMatches** を通して、
// 実際に運営者が触る経路から同じ構造が出てくることを確かめる。

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BadmintonDb, useDb } from '../db'
import {
  addEntries,
  addEvent,
  addStage,
  buildGroups,
  buildMatches,
  createTournament,
  enterResult,
  standings,
} from '../usecases'
import { findTeamLineup } from '../../domain/presets'

let d: BadmintonDb
let dbIndex = 0
const SCHEDULE = { courtCount: 6, startTime: '9:30', slotMinutes: 30 }
const TEAMS = ['はりーあっぷ', '紫電会', 'FLIGHT', 'WISTARIA', 'RHBT', 'RS NOANAKA']

beforeEach(async () => {
  dbIndex += 1
  d = new BadmintonDb(`team-${dbIndex}`)
  useDb(d)
  await d.open()
})

/** 6チーム総当たりの団体戦を1つ作る。 */
async function setup(teamLineupId = '2d1s') {
  const t = await createTournament(
    {
      name: '社会人クラブ対抗',
      date: '2026-05-02',
      venue: '体育館',
      organizer: 'テスト',
      courtCount: 6,
      scoringPresetId: '21pt-3g',
      rankingPresetId: 'team-league-aichi',
    },
    d,
  )
  const ev = await addEvent(
    t.id,
    {
      name: '男子1部',
      discipline: 'TEAM',
      category: '1部',
      entryType: 'TEAM',
      teamLineupId,
      scoringRuleId: null,
      rankingRulePresetId: null,
    },
    d,
  )
  const st = await addStage(t.id, ev.id, { name: 'リーグ戦', type: 'ROUND_ROBIN' }, d)
  await addEntries(
    t.id,
    ev.id,
    TEAMS.map((name) => ({ playerNames: [name], affiliation: name })),
    d,
  )
  await buildGroups({ stageId: st.id, groupCount: 1, drawSeed: 1 }, d)
  const matches = await buildMatches(t.id, SCHEDULE, d)
  const groups = await d.groups.where({ stageId: st.id }).toArray()
  return { t, ev, st, matches, group: groups[0] }
}

// ---------------------------------------------------------------------------

describe('2複1単の団体戦を組む', () => {
  it('6チーム総当たりは15対戦', async () => {
    const { matches } = await setup()
    const ties = new Set(matches.map((m) => m.tieId))
    expect(ties.size).toBe(15)
    expect([...ties].every((x) => x !== null)).toBe(true)
  })

  it('**1対戦が3試合に分かれる**', async () => {
    const { matches } = await setup()
    expect(matches).toHaveLength(45)
    const byTie = new Map<string, number>()
    for (const m of matches) byTie.set(m.tieId ?? '', (byTie.get(m.tieId ?? '') ?? 0) + 1)
    expect([...byTie.values()].every((n) => n === 3)).toBe(true)
  })

  it('枠の名前と順番が要項どおり（複・単・複）', async () => {
    const { matches } = await setup()
    const first = matches.filter((m) => m.tieId === matches[0].tieId)
    expect(first.map((m) => m.lineupSlot)).toEqual(['第1ダブルス', 'シングルス', '第2ダブルス'])
  })

  it('同じ対戦の3試合は同じコート・同じ時刻に置かれる', async () => {
    const { matches } = await setup()
    const first = matches.filter((m) => m.tieId === matches[0].tieId)
    expect(new Set(first.map((m) => m.courtId)).size).toBe(1)
    expect(new Set(first.map((m) => m.scheduledAt)).size).toBe(1)
  })

  it('通し番号は試合ごとに連番になる', async () => {
    const { matches } = await setup()
    expect(matches.map((m) => m.number)).toEqual(matches.map((_, i) => i + 1))
  })

  it('3複の構成も選べる（シニアの部で実在する形）', async () => {
    const { matches } = await setup('3d')
    const first = matches.filter((m) => m.tieId === matches[0].tieId)
    expect(first.map((m) => m.lineupSlot)).toEqual([
      '第1ダブルス',
      '第2ダブルス',
      '第3ダブルス',
    ])
  })

  it('5枠の構成（3単2複）は1対戦が5試合になる', async () => {
    const { matches } = await setup('3s2d')
    expect(matches).toHaveLength(15 * 5)
    expect(findTeamLineup('3s2d')?.slots).toHaveLength(5)
  })
})

describe('集計が対戦単位とマッチ単位に分かれる', () => {
  it('**勝敗は対戦、マッチ得失はマッチ**で数える', async () => {
    const { matches, group } = await setup()
    // 1対戦だけ 2-1 で決着させる
    const tieId = matches[0].tieId
    const three = matches.filter((m) => m.tieId === tieId)
    const [a, b] = three[0].entryIds
    await enterResult(
      { matchId: three[0].id, games: [{ scoreA: 21, scoreB: 15 }, { scoreA: 21, scoreB: 10 }] },
      d,
    )
    await enterResult(
      { matchId: three[1].id, games: [{ scoreA: 15, scoreB: 21 }, { scoreA: 10, scoreB: 21 }] },
      d,
    )
    await enterResult(
      { matchId: three[2].id, games: [{ scoreA: 21, scoreB: 18 }, { scoreA: 21, scoreB: 19 }] },
      d,
    )

    const r = await standings(group.id, d)
    const A = r.entries.find((x) => x.entryId === a)
    const B = r.entries.find((x) => x.entryId === b)
    // 対戦としては A の1勝、B の1敗
    expect([A?.stats.wins, A?.stats.losses]).toEqual([1, 0])
    expect([B?.stats.wins, B?.stats.losses]).toEqual([0, 1])
    // マッチとしては 2-1
    expect([A?.stats.matchesWon, A?.stats.matchesLost]).toEqual([2, 1])
    expect([B?.stats.matchesWon, B?.stats.matchesLost]).toEqual([1, 2])
  })

  it('対戦がすべて未消化なら順位は付くが根拠は空にならない', async () => {
    const { group } = await setup()
    const r = await standings(group.id, d)
    expect(r.entries).toHaveLength(6)
    for (const e of r.entries) expect(e.reason).not.toBe('')
  })
})

describe('個人戦は今までどおり', () => {
  it('オーダー構成を持たない種目は1対戦=1試合のまま', async () => {
    const t = await createTournament(
      { name: 'ダブルスの大会', date: '2026-09-06', venue: '体育館', organizer: 'テスト', courtCount: 6 },
      d,
    )
    const ev = await addEvent(
      t.id,
      { name: '男子ダブルス', discipline: 'MD', category: '1部', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null },
      d,
    )
    const st = await addStage(t.id, ev.id, { name: '予選リーグ', type: 'ROUND_ROBIN' }, d)
    await addEntries(
      t.id,
      ev.id,
      Array.from({ length: 4 }, (_, i) => ({ playerNames: [`甲${i}`, `乙${i}`], affiliation: `${i}会` })),
      d,
    )
    await buildGroups({ stageId: st.id, groupCount: 1, drawSeed: 1 }, d)
    const matches = await buildMatches(t.id, SCHEDULE, d)
    expect(matches).toHaveLength(6)
    expect(matches.every((m) => m.tieId === null)).toBe(true)
    expect(matches.every((m) => m.lineupSlot === null)).toBe(true)
  })
})

describe('順位の基準は種目ごとに解決する', () => {
  it('**団体戦は団体戦用の基準を使う**（大会の既定を引きずらない）', async () => {
    const { ev } = await setup()
    const rec = await d.events.get(ev.id)
    expect(rec?.rankingRulePresetId).toBe('team-league-aichi')
  })

  it('まだ1試合も終わっていない段階で抽選に落とさない', async () => {
    const { group } = await setup()
    const r = await standings(group.id, d)
    expect(r.warnings.some((w) => w.kind === 'DRAW_USED')).toBe(false)
    for (const e of r.entries) expect(e.reason).toBe('まだ試合が行われていません')
  })

  it('個人戦は大会の既定のまま', async () => {
    const t = await createTournament(
      { name: '個人戦', date: '2026-09-06', venue: '体育館', organizer: 'テスト', courtCount: 4 },
      d,
    )
    const ev = await addEvent(
      t.id,
      { name: '男子ダブルス', discipline: 'MD', category: '', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null },
      d,
    )
    const rec = await d.events.get(ev.id)
    expect(rec?.rankingRulePresetId).toBeNull()
  })
})
