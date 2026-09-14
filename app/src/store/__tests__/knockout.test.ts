// トーナメントの通し。個人戦と団体戦の両方で、画面が呼ぶ経路から組む。

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BadmintonDb, useDb } from '../db'
import {
  addEntries,
  addEvent,
  addStage,
  buildGroups,
  buildMatches,
  clearResult,
  createTournament,
  enterResult,
  undo,
} from '../usecases'

let d: BadmintonDb
let dbIndex = 0
const SCHEDULE = { courtCount: 6, startTime: '9:30', slotMinutes: 30 }

beforeEach(async () => {
  dbIndex += 1
  d = new BadmintonDb(`ko-${dbIndex}`)
  useDb(d)
  await d.open()
})

async function setup(n: number, opts: { team?: boolean; size?: number } = {}) {
  const t = await createTournament(
    { name: '新人大会', date: '2026-08-22', venue: '体育館', organizer: 'テスト', courtCount: 6, scoringPresetId: '15pt-3g-cap21' },
    d,
  )
  const ev = await addEvent(
    t.id,
    opts.team
      ? { name: '団体', discipline: 'TEAM', category: '', entryType: 'TEAM', teamLineupId: '2d1s', scoringRuleId: null, rankingRulePresetId: null }
      : { name: '男子シングルス', discipline: 'MS', category: '', entryType: 'INDIVIDUAL', scoringRuleId: null, rankingRulePresetId: null },
    d,
  )
  const st = await addStage(
    t.id,
    ev.id,
    { name: 'トーナメント', type: 'SINGLE_ELIMINATION', options: { drawSeed: 7, bracketSize: opts.size } },
    d,
  )
  await addEntries(
    t.id,
    ev.id,
    Array.from({ length: n }, (_, i) => ({ playerNames: [`選手${i + 1}`], affiliation: `${i % 5}会` })),
    d,
  )
  await buildGroups({ stageId: st.id, groupCount: 1, drawSeed: 7 }, d)
  const matches = await buildMatches(t.id, SCHEDULE, d)
  return { t, ev, st, matches }
}

describe('個人戦のトーナメント', () => {
  it('**実施する試合は「出場者数 − 1」**', async () => {
    for (const n of [8, 13, 21, 32]) {
      const { matches } = await setup(n)
      const played = matches.filter((m) => m.resultType !== 'BYE')
      expect(played.length, `${n}人`).toBe(n - 1)
    }
  })

  it('BYE の枠は実施済みとして置かれ、勝者が入っている', async () => {
    const { matches } = await setup(13)
    const byes = matches.filter((m) => m.resultType === 'BYE')
    expect(byes.length).toBeGreaterThan(0)
    for (const m of byes) {
      expect(m.status).toBe('COMPLETED')
      expect(m.winnerEntryId).not.toBeNull()
    }
  })

  it('勝ち上がり先が実在する試合を指す。決勝だけが持たない', async () => {
    const { matches } = await setup(21)
    const ids = new Set(matches.map((m) => m.id))
    const heads = matches.filter((m) => m.numberInGroup === m.slotInRound)
    const noNext = heads.filter((m) => m.nextMatchId === null)
    expect(noNext.length).toBeGreaterThanOrEqual(1)
    for (const m of matches) {
      if (m.nextMatchId === null) continue
      expect(ids.has(m.nextMatchId), `${m.round}-${m.slotInRound}`).toBe(true)
    }
  })

  it('相手が決まっていない試合は待機のままにする', async () => {
    const { matches } = await setup(21)
    const pending = matches.filter((m) => m.status === 'PENDING')
    expect(pending.length).toBeGreaterThan(0)
    for (const m of pending) {
      expect(m.entryIds.some((x) => x === null)).toBe(true)
    }
  })

  it('**トーナメントには時刻とコートを割り当てない**', async () => {
    const { matches } = await setup(16)
    // 1回戦が終わらないと2回戦の相手が決まらないので、先に時間割を作っても外れる。
    expect(matches.every((m) => m.scheduledAt === null)).toBe(true)
    expect(matches.every((m) => m.courtId === null)).toBe(true)
  })

  it('枠数を明示すると、そこに入りきらない人数は黙って捨てずに落ちる', async () => {
    await expect(setup(20, { size: 16 })).rejects.toThrow(/入りません/)
  })
})

describe('団体戦のトーナメント', () => {
  it('1対戦が3試合に分かれ、BYE も3試合ぶん置かれる', async () => {
    const { matches } = await setup(6, { team: true })
    const ties = new Set(matches.map((m) => m.tieId))
    expect(ties.size).toBe(matches.length / 3)
    const byTie = new Map<string, number>()
    for (const m of matches) byTie.set(m.tieId ?? '', (byTie.get(m.tieId ?? '') ?? 0) + 1)
    expect([...byTie.values()].every((x) => x === 3)).toBe(true)
  })

  it('枠の名前が入る', async () => {
    const { matches } = await setup(4, { team: true })
    const first = matches.filter((m) => m.tieId === matches[0].tieId)
    expect(first.map((m) => m.lineupSlot)).toEqual(['第1ダブルス', 'シングルス', '第2ダブルス'])
  })
})

describe('リーグとトーナメントが同じ大会に共存する', () => {
  it('ブロック戦の試合には時刻が入り、トーナメントには入らない', async () => {
    const t = await createTournament(
      { name: '混在', date: '2026-09-06', venue: '体育館', organizer: 'テスト', courtCount: 4 },
      d,
    )
    const league = await addEvent(
      t.id,
      { name: '男子ダブルス', discipline: 'MD', category: '', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null },
      d,
    )
    const ls = await addStage(t.id, league.id, { name: '予選リーグ', type: 'ROUND_ROBIN' }, d)
    await addEntries(
      t.id,
      league.id,
      Array.from({ length: 4 }, (_, i) => ({ playerNames: [`甲${i}`, `乙${i}`], affiliation: `${i}会` })),
      d,
    )
    await buildGroups({ stageId: ls.id, groupCount: 1, drawSeed: 1 }, d)

    const cup = await addEvent(
      t.id,
      { name: '女子シングルス', discipline: 'WS', category: '', entryType: 'INDIVIDUAL', scoringRuleId: null, rankingRulePresetId: null },
      d,
    )
    const cs = await addStage(t.id, cup.id, { name: 'トーナメント', type: 'SINGLE_ELIMINATION', options: { drawSeed: 3 } }, d)
    await addEntries(
      t.id,
      cup.id,
      Array.from({ length: 8 }, (_, i) => ({ playerNames: [`丙${i}`], affiliation: `${i}会` })),
      d,
    )
    await buildGroups({ stageId: cs.id, groupCount: 1, drawSeed: 3 }, d)

    const matches = await buildMatches(t.id, SCHEDULE, d)
    const inLeague = matches.filter((m) => m.eventId === league.id)
    const inCup = matches.filter((m) => m.eventId === cup.id)
    expect(inLeague).toHaveLength(6)
    expect(inLeague.every((m) => m.scheduledAt !== null)).toBe(true)
    expect(inCup).toHaveLength(7)
    expect(inCup.every((m) => m.scheduledAt === null)).toBe(true)
    // 通し番号は大会全体で重複しない
    expect(new Set(matches.map((m) => m.number)).size).toBe(matches.length)
  })
})

describe('勝ち上がり', () => {
  /** 1回戦の実施試合を番号順に取る。 */
  const playable = (ms: Awaited<ReturnType<typeof buildMatches>>) =>
    ms.filter((m) => m.round === 1 && m.resultType !== 'BYE').sort((a, b) => a.slotInRound - b.slotInRound)

  it('**勝者が次の試合の枠に入る**', async () => {
    const { t, matches } = await setup(8)
    const first = playable(matches)[0]
    await enterResult(
      { matchId: first.id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 11 }] },
      d,
    )
    const next = await d.matches.get(first.nextMatchId as string)
    expect(next?.entryIds).toContain(first.entryIds[0])
    void t
  })

  it('奇数番は上の枠、偶数番は下の枠に入る', async () => {
    const { matches } = await setup(8)
    const [m1, m2] = playable(matches)
    await enterResult({ matchId: m1.id, games: [{ scoreA: 15, scoreB: 0 }, { scoreA: 15, scoreB: 0 }] }, d)
    await enterResult({ matchId: m2.id, games: [{ scoreA: 0, scoreB: 15 }, { scoreA: 0, scoreB: 15 }] }, d)
    expect(m1.nextMatchId).toBe(m2.nextMatchId)
    const next = await d.matches.get(m1.nextMatchId as string)
    expect(next?.entryIds[0]).toBe(m1.entryIds[0])
    expect(next?.entryIds[1]).toBe(m2.entryIds[1])
    expect(next?.status).toBe('READY')
  })

  it('片方しか決まっていないうちは待機のまま', async () => {
    const { matches } = await setup(8)
    const m1 = playable(matches)[0]
    await enterResult({ matchId: m1.id, games: [{ scoreA: 15, scoreB: 0 }, { scoreA: 15, scoreB: 0 }] }, d)
    const next = await d.matches.get(m1.nextMatchId as string)
    expect(next?.status).toBe('PENDING')
  })

  it('取り消すと次の試合から消える', async () => {
    const { matches } = await setup(8)
    const m1 = playable(matches)[0]
    await enterResult({ matchId: m1.id, games: [{ scoreA: 15, scoreB: 0 }, { scoreA: 15, scoreB: 0 }] }, d)
    await clearResult(m1.id, d)
    const next = await d.matches.get(m1.nextMatchId as string)
    expect(next?.entryIds[0]).toBeNull()
    expect(next?.status).toBe('PENDING')
  })

  it('取り消しのトーストから戻しても整合する', async () => {
    const { t, matches } = await setup(8)
    const m1 = playable(matches)[0]
    const { operation } = await enterResult(
      { matchId: m1.id, games: [{ scoreA: 15, scoreB: 0 }, { scoreA: 15, scoreB: 0 }] },
      d,
    )
    await undo(operation.id, d)
    const next = await d.matches.get(m1.nextMatchId as string)
    expect(next?.entryIds[0]).toBeNull()
    const self = await d.matches.get(m1.id)
    expect(self?.winnerEntryId).toBeNull()
    void t
  })

  it('**団体戦は対戦の過半数を取った側が勝ち上がる**', async () => {
    const { matches } = await setup(4, { team: true })
    const tie = matches.filter((m) => m.round === 1 && m.tieId === matches[0].tieId)
    const [a, b] = tie[0].entryIds
    const nextId = tie[0].nextMatchId as string

    // 1試合目。まだ決まらない。
    await enterResult({ matchId: tie[0].id, games: [{ scoreA: 15, scoreB: 5 }, { scoreA: 15, scoreB: 7 }] }, d)
    let next = await d.matches.get(nextId)
    expect(next?.entryIds[0]).toBeNull()

    // 2試合目を落とす。1勝1敗でまだ決まらない。
    await enterResult({ matchId: tie[1].id, games: [{ scoreA: 5, scoreB: 15 }, { scoreA: 7, scoreB: 15 }] }, d)
    next = await d.matches.get(nextId)
    expect(next?.entryIds[0]).toBeNull()

    // 3試合目で2勝。ここで初めて上がる。
    await enterResult({ matchId: tie[2].id, games: [{ scoreA: 15, scoreB: 9 }, { scoreA: 15, scoreB: 8 }] }, d)
    next = await d.matches.get(nextId)
    expect(next?.entryIds[0]).toBe(a)
    void b
  })

  it('団体戦では次の対戦の3試合すべてに入る', async () => {
    const { matches } = await setup(4, { team: true })
    const tie = matches.filter((m) => m.round === 1 && m.tieId === matches[0].tieId)
    for (const m of tie) {
      await enterResult({ matchId: m.id, games: [{ scoreA: 15, scoreB: 3 }, { scoreA: 15, scoreB: 4 }] }, d)
    }
    const head = await d.matches.get(tie[0].nextMatchId as string)
    const nextTie = (await d.matches.toArray()).filter((x) => x.tieId === head?.tieId)
    expect(nextTie).toHaveLength(3)
    expect(nextTie.every((x) => x.entryIds[0] === tie[0].entryIds[0])).toBe(true)
  })
})

describe('トーナメントはブロックに割らない', () => {
  it('**出場者全員が1つのドローに入る**', async () => {
    const { st } = await setup(13)
    const groups = await d.groups.where({ stageId: st.id }).toArray()
    expect(groups).toHaveLength(1)
    expect(groups[0].entryIds).toHaveLength(13)
    expect(groups[0].name).toBe('本戦')
  })

  it('13人なら12試合。小さなトーナメントに割れない', async () => {
    const { matches } = await setup(13)
    expect(matches.filter((m) => m.resultType !== 'BYE')).toHaveLength(12)
  })

  it('リーグは今までどおりブロックに割る', async () => {
    const t = await createTournament(
      { name: 'リーグ', date: '2026-09-06', venue: '体育館', organizer: 'テスト', courtCount: 4 },
      d,
    )
    const ev = await addEvent(
      t.id,
      { name: '男子ダブルス', discipline: 'MD', category: '', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null },
      d,
    )
    const st = await addStage(t.id, ev.id, { name: 'ブロック戦', type: 'ROUND_ROBIN' }, d)
    await addEntries(
      t.id,
      ev.id,
      Array.from({ length: 12 }, (_, i) => ({ playerNames: [`甲${i}`, `乙${i}`], affiliation: `${i % 3}会` })),
      d,
    )
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const groups = await d.groups.where({ stageId: st.id }).toArray()
    expect(groups.length).toBeGreaterThan(1)
  })

  it('抽選をやり直すとドローが変わる', async () => {
    const { st, ev, t } = await setup(13)
    const before = (await d.matches.where({ stageId: st.id }).toArray())
      .filter((m) => m.round === 1)
      .map((m) => m.entryIds.join('|'))
      .sort()
    await buildGroups({ stageId: st.id, groupCount: 1, drawSeed: 999 }, d)
    await buildMatches(t.id, SCHEDULE, d)
    const after = (await d.matches.where({ stageId: st.id }).toArray())
      .filter((m) => m.round === 1)
      .map((m) => m.entryIds.join('|'))
      .sort()
    expect(after).not.toEqual(before)
    void ev
  })
})
