// すでに決まっている組合せを入れる経路。
//
// **多くの大会は、申込を締め切ってから運営が組合せを決め、表を配ってから当日を迎える。**
// 必要なのは抽選ではなく、決まったものをそのまま反映することのほう。

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BadmintonDb, useDb } from '../db'
import { addEntries, addEvent, addStage, buildGroups, buildMatches, createTournament } from '../usecases'

let d: BadmintonDb
let n = 0
const SCHEDULE = { courtCount: 6, startTime: '9:30', slotMinutes: 30 }

beforeEach(async () => {
  n += 1
  d = new BadmintonDb(`planned-${n}`)
  useDb(d)
  await d.open()
})

/** 組合せ表のとおりに登録する。 */
async function setup(rows: { group: string | null; name: string; club: string }[]) {
  const t = await createTournament(
    { name: 'スポーツ祭典', date: '2026-09-06', venue: '体育館', organizer: 'テスト', courtCount: 6 },
    d,
  )
  const ev = await addEvent(
    t.id,
    { name: '男子ダブルス 1部', discipline: 'MD', category: '', entryType: 'PAIR', scoringRuleId: null, rankingRulePresetId: null },
    d,
  )
  const st = await addStage(t.id, ev.id, { name: 'ブロック戦', type: 'ROUND_ROBIN' }, d)
  await addEntries(
    t.id,
    ev.id,
    rows.map((r) => ({ playerNames: [r.name], affiliation: r.club, plannedGroup: r.group })),
    d,
  )
  return { t, ev, st }
}

const 組合せ表 = [
  { group: 'A組', name: '甲1', club: 'しらかば' },
  { group: 'A組', name: '甲2', club: 'かえで会' },
  { group: 'A組', name: '甲3', club: 'あおぞら' },
  { group: 'B組', name: '乙1', club: 'みどり台' },
  { group: 'B組', name: '乙2', club: 'つばさ' },
  { group: 'C組', name: '丙1', club: 'ひまわり' },
  { group: 'C組', name: '丙2', club: 'もみじ' },
  { group: 'C組', name: '丙3', club: 'すずかけ' },
]

describe('決まっている組をそのまま使う', () => {
  it('**抽選を回さない。**指定どおりに分かれる', async () => {
    const { st } = await setup(組合せ表)
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const gs = (await d.groups.where({ stageId: st.id }).toArray()).sort((a, b) => a.order - b.order)
    expect(gs.map((g) => g.name)).toEqual(['A組', 'B組', 'C組'])
    expect(gs.map((g) => g.entryIds.length)).toEqual([3, 2, 3])
  })

  it('組の名前を勝手に振り直さない', async () => {
    const { st } = await setup([
      { group: '男子1部A', name: '甲1', club: 'X' },
      { group: '男子1部A', name: '甲2', club: 'Y' },
      { group: '男子1部B', name: '乙1', club: 'Z' },
      { group: '男子1部B', name: '乙2', club: 'W' },
    ])
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const gs = (await d.groups.where({ stageId: st.id }).toArray()).sort((a, b) => a.order - b.order)
    expect(gs.map((g) => g.name)).toEqual(['男子1部A', '男子1部B'])
  })

  it('**1ブロックの組数の指定を無視する。**決まっているほうが優先', async () => {
    const { st } = await setup(組合せ表)
    // 4組ずつに割るよう指定しても、3・2・3 のまま
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const gs = await d.groups.where({ stageId: st.id }).toArray()
    expect(gs).toHaveLength(3)
  })

  it('何度やり直しても同じ組になる（抽選ではないので）', async () => {
    const { st } = await setup(組合せ表)
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const a = (await d.groups.where({ stageId: st.id }).toArray()).map((g) => g.entryIds.join(','))
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 999 }, d)
    const b = (await d.groups.where({ stageId: st.id }).toArray()).map((g) => g.entryIds.join(','))
    expect(b).toEqual(a)
  })

  it('試合まで組める', async () => {
    const { t, st } = await setup(組合せ表)
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const ms = await buildMatches(t.id, SCHEDULE, d)
    // 3人・2人・3人の総当たり = 3 + 1 + 3
    expect(ms).toHaveLength(7)
  })
})

describe('組が一部だけ決まっているとき', () => {
  it('決まっている分はそのまま、空の分は「未定」にまとめる', async () => {
    const { st } = await setup([
      { group: 'A組', name: '甲1', club: 'X' },
      { group: 'A組', name: '甲2', club: 'Y' },
      { group: null, name: '丙1', club: 'Z' },
      { group: null, name: '丙2', club: 'W' },
    ])
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const gs = (await d.groups.where({ stageId: st.id }).toArray()).sort((a, b) => a.order - b.order)
    expect(gs.map((g) => g.name)).toEqual(['A組', '未定'])
    expect(gs[1].entryIds).toHaveLength(2)
  })
})

describe('組が決まっていないとき', () => {
  it('**今までどおり抽選する**', async () => {
    const { st } = await setup(組合せ表.map((r) => ({ ...r, group: null })))
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const gs = await d.groups.where({ stageId: st.id }).toArray()
    expect(gs.every((g) => /^[A-Z]組$/.test(g.name))).toBe(true)
  })

  it('抽選のやり直しで組が変わる', async () => {
    const { st } = await setup(組合せ表.map((r) => ({ ...r, group: null })))
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 1 }, d)
    const a = (await d.groups.where({ stageId: st.id }).toArray()).map((g) => g.entryIds.join(','))
    await buildGroups({ stageId: st.id, perGroup: 4, drawSeed: 12345 }, d)
    const b = (await d.groups.where({ stageId: st.id }).toArray()).map((g) => g.entryIds.join(','))
    expect(b).not.toEqual(a)
  })
})
