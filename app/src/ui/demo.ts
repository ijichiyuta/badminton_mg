// デモ用の初期データ。
//
// 第1号提供先の 2026-09-06 の構成に合わせる（docs/17-first-customer.md）。
// 6コート・30分刻み・4チーム/5チームのブロック混在・上限17。
//
// **氏名は実在のものを使わない。** 所属名も架空のものにする。

import {
  addEntries,
  addEvent,
  addStage,
  buildGroups,
  buildMatches,
  createTournament,
  enterResult,
} from '../store/usecases'
import { db, type BadmintonDb } from '../store/db'
import type { TournamentRecord } from '../store/schema'

const CLUBS = [
  'あおぞらクラブ', 'みどり台BC', 'かえで会', 'しらかば', 'つばさクラブ',
  'ひまわり', 'もみじ体育館', 'すずかけ', 'こもれびBC', 'あかつき',
  'なぎさクラブ', 'やまびこ', 'ほたる会', 'せせらぎ', 'かがやきBC',
]

/** 団体戦のチーム名。架空のもの。 */
const TEAMS = ['あおぞらクラブ', 'みどり台BC', 'かえで会', 'しらかば', 'つばさクラブ', 'ひまわり']

const FAMILY = ['青木', '井上', '遠藤', '大野', '加藤', '木村', '工藤', '小林', '斉藤', '清水']
const GIVEN_M = ['健太', '翔', '大輔', '拓也', '涼', '直樹', '悠', '亮', '和也', '駿']
const GIVEN_F = ['美咲', '陽菜', '彩', '奈々', '真央', '楓', '結衣', '里桜', '千尋', '紗希']

/**
 * 架空の氏名。姓と名を別々の周期で回して、ペアの2人が同名にならないようにする。
 * 素直に i を割ると、隣り合う2人の名が同じになって明らかに嘘くさくなる。
 */
function name(i: number, female: boolean): string {
  const given = female ? GIVEN_F : GIVEN_M
  const f = FAMILY[i % FAMILY.length]
  // 姓の周期（10）と互いに素な周期で名を回す。
  const g = given[(i * 3 + Math.floor(i / FAMILY.length)) % given.length]
  return `${f} ${g}`
}

/** この名前の大会は見本として扱う。画面で「自分の大会ではない」と伝えるのに使う。 */
export const DEMO_TOURNAMENT_NAME = '見本の大会'

export interface DemoSection {
  eventName: string
  category: string
  female: boolean
  /** ブロックのチーム数。現行は4が基本で、申込状況により5が混ざる。 */
  blocks: number[]
}

/** 2026-09-06 と同じ構成。男女ダブルスの1〜3部。 */
export const DEMO_SECTIONS: DemoSection[] = [
  { eventName: '男子ダブルス 1部', category: '1部', female: false, blocks: [4] },
  { eventName: '男子ダブルス 2部', category: '2部', female: false, blocks: [4, 4, 4] },
  { eventName: '男子ダブルス 3部', category: '3部', female: false, blocks: [5, 4, 4, 4] },
  { eventName: '女子ダブルス 2部', category: '2部', female: true, blocks: [4, 4] },
  { eventName: '女子ダブルス 3部', category: '3部', female: true, blocks: [5, 5, 5] },
]

export interface SeedOptions {
  /** 何試合ぶんの結果を入れておくか。触ってすぐ動きが分かるようにする。 */
  prefilledMatches?: number
}

export async function seedDemo(
  opts: SeedOptions = {},
  d: BadmintonDb = db(),
): Promise<TournamentRecord> {
  const t = await createTournament(
    {
      name: DEMO_TOURNAMENT_NAME,
      date: '2026-09-06',
      venue: '市民体育館',
      organizer: 'デモ',
      courtCount: 6,
      // 現行の要項どおり。15点3ゲーム・14オール延長2点差・最大17。
      scoringPresetId: '15pt-3g-cap17',
    },
    d,
  )

  let playerSeq = 0
  for (const sec of DEMO_SECTIONS) {
    const ev = await addEvent(
      t.id,
      {
        name: sec.eventName,
        discipline: sec.female ? 'WD' : 'MD',
        category: sec.category,
        entryType: 'PAIR',
        scoringRuleId: null,
        rankingRulePresetId: null,
      },
      d,
    )
    const st = await addStage(t.id, ev.id, { name: '予選リーグ', type: 'ROUND_ROBIN' }, d)

    const total = sec.blocks.reduce((s, n) => s + n, 0)
    await addEntries(
      t.id,
      ev.id,
      Array.from({ length: total }, (_, i) => ({
        playerNames: [name(playerSeq + i * 2, sec.female), name(playerSeq + i * 2 + 1, sec.female)],
        affiliation: CLUBS[(playerSeq + i) % CLUBS.length],
      })),
      d,
    )
    playerSeq += total * 2

    // ブロックのチーム数が揃っていないので、ブロック数で切ってから
    // 5チームぶんを先頭へ寄せる（現行の「4チーム・5チーム混在」を再現）。
    await buildGroups(
      { stageId: st.id, groupCount: sec.blocks.length, drawSeed: 20260906, separateSameAffiliation: true },
      d,
    )
  }

  // 団体戦とトーナメントも1つずつ入れておく。
  // **この道具が何を扱えるかは、触って見ないと伝わらない。**
  await seedTeamEvent(t.id, d)
  await seedKnockout(t.id, d)

  const matches = await buildMatches(
    t.id,
    { courtCount: 6, startTime: '9:30', slotMinutes: 30 },
    d,
  )

  // 触ってすぐ動きが分かるよう、序盤の結果を入れておく。
  const n = opts.prefilledMatches ?? 14
  const scores: [number, number][][] = [
    [[15, 9], [15, 11]],
    [[15, 6], [13, 15], [15, 12]],
    [[9, 15], [11, 15]],
    [[16, 14], [15, 8]],
    [[15, 12], [10, 15], [17, 15]],
  ]
  for (let i = 0; i < Math.min(n, matches.length); i++) {
    const pattern = scores[i % scores.length]
    await enterResult(
      { matchId: matches[i].id, games: pattern.map(([a, b]) => ({ scoreA: a, scoreB: b })) },
      d,
    )
  }

  return t
}

/** 団体戦。愛知の社会人リーグと同じ 6チーム総当たり・2複1単。 */
async function seedTeamEvent(tournamentId: string, d: BadmintonDb) {
  const ev = await addEvent(
    tournamentId,
    {
      name: '男子団体',
      discipline: 'TEAM',
      category: '',
      entryType: 'TEAM',
      teamLineupId: '2d1s',
      scoringRuleId: null,
      rankingRulePresetId: null,
    },
    d,
  )
  const st = await addStage(tournamentId, ev.id, { name: 'ブロック戦', type: 'ROUND_ROBIN' }, d)
  await addEntries(
    tournamentId,
    ev.id,
    TEAMS.map((name) => ({ playerNames: [name], affiliation: name })),
    d,
  )
  await buildGroups({ stageId: st.id, groupCount: 1, drawSeed: 20260906 }, d)
}

/** トーナメント。13人が16のドローに入る、BYE が多い実際の形。 */
async function seedKnockout(tournamentId: string, d: BadmintonDb) {
  const ev = await addEvent(
    tournamentId,
    {
      name: '男子シングルス 選手権',
      discipline: 'MS',
      category: '',
      entryType: 'INDIVIDUAL',
      scoringRuleId: null,
      rankingRulePresetId: null,
    },
    d,
  )
  const st = await addStage(
    tournamentId,
    ev.id,
    { name: 'トーナメント', type: 'SINGLE_ELIMINATION', options: { drawSeed: 20260906 } },
    d,
  )
  await addEntries(
    tournamentId,
    ev.id,
    Array.from({ length: 13 }, (_, i) => ({
      playerNames: [name(200 + i, false)],
      affiliation: CLUBS[i % CLUBS.length],
    })),
    d,
  )
  await buildGroups({ stageId: st.id, groupCount: 1, drawSeed: 20260906 }, d)
}

/** すでにデモが入っていればそれを返し、無ければ作る。 */
export async function ensureDemo(d: BadmintonDb = db()): Promise<TournamentRecord> {
  const existing = await d.tournaments.toArray()
  if (existing.length > 0) return existing[0]
  return seedDemo({}, d)
}

/** デモを作り直す。 */
export async function resetDemo(d: BadmintonDb = db()): Promise<TournamentRecord> {
  await Promise.all([
    d.tournaments.clear(),
    d.events.clear(),
    d.stages.clear(),
    d.groups.clear(),
    d.entries.clear(),
    d.players.clear(),
    d.matches.clear(),
    d.scoringRules.clear(),
    d.rankingRules.clear(),
    d.operations.clear(),
    d.backups.clear(),
  ])
  return seedDemo({}, d)
}
