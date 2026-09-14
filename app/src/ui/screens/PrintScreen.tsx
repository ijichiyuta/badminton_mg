// 印刷。docs/07 F-9 / docs/15-ui-ux.md 第2部10
//
// 紙は一級市民（UX原則7）。会場掲示と本部控えのために印刷は必須。
// 「印刷セット」を主役にする。必要な紙が1操作で全部出ることが、
// 手伝いの人へ作業を委譲する前提になる（O-5-3）。

import { useEffect, useState } from 'react'
import { describeRule } from '../../domain/scoring'
import { OFFICIAL_COLUMNS, buildScoresheet, columnsPerGame, type Scoresheet } from '../scoresheet'
import { OFTEN_FILLED, REFEREE_FIELDS } from '../refereeSheet'
import { assignReferees } from '../../domain/schedule'
import type { RankingResult } from '../../domain/types'
import { cellView } from '../standings'
import { circled, type Indexes } from '../useApp'
import type {
  GroupRecord,
  MatchRecord,
  ScoringRuleRecord,
  TournamentRecord,
} from '../../store/schema'

type Kind = 'standings' | 'timetable' | 'scoresheets' | 'referee'

interface Props {
  /** ブロックの順位を取る。印刷の直前に計算して、画面と同じ結果を刷る。 */
  getStandings: (groupId: string) => Promise<RankingResult>
  tournament: TournamentRecord
  groups: GroupRecord[]
  matches: MatchRecord[]
  rules: ScoringRuleRecord[]
  idx: Indexes
}

export function PrintScreen({ tournament, groups, matches, rules, idx, getStandings }: Props) {
  const [kind, setKind] = useState<Kind | null>(null)
  const [scope, setScope] = useState<'all' | 'pending'>('pending')

  if (kind) {
    return (
      <PrintView
        kind={kind}
        scope={scope}
        getStandings={getStandings}
        tournament={tournament}
        groups={groups}
        matches={matches}
        rules={rules}
        idx={idx}
        onBack={() => setKind(null)}
      />
    )
  }

  const pending = matches.filter((m) => m.status !== 'COMPLETED')
  // 団体戦の対戦だけを数える。個人戦しかない大会では審判用紙を出さない。
  const ties = [...new Set(matches.filter((m) => m.tieId).map((m) => m.tieId))]

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <h2 className="mb-1 text-base font-bold">印刷</h2>
      <p className="mb-3 text-xs text-ink-2">
        ブラウザの印刷画面が開きます。A4横向きを選んでください。
      </p>

      <Card
        title="星取表"
        note={`${groups.length}ブロック`}
        detail="会場掲示と本部控え。順位の根拠つき"
        onClick={() => setKind('standings')}
      />
      {ties.length > 0 && (
        <Card
          title="審判用紙（団体戦）"
          note={`${ties.length}対戦`}
          detail="1対戦1枚。オーダーが入った状態で出ます"
          onClick={() => setKind('referee')}
        />
      )}
      <Card
        title="タイムテーブル"
        note={`${matches.length}試合`}
        detail="コート × 時刻のグリッド。審判の割当つき"
        onClick={() => setKind('timetable')}
      />
      <Card
        title="スコアシート"
        note={scope === 'pending' ? `未入力 ${pending.length}試合` : `全 ${matches.length}試合`}
        detail="フルグリッド版。1試合1枚"
        onClick={() => setKind('scoresheets')}
      >
        <div className="mt-2 flex gap-2">
          {(
            [
              ['pending', `未入力だけ（${pending.length}）`],
              ['all', `全部（${matches.length}）`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={(e) => {
                e.stopPropagation()
                setScope(v)
              }}
              className={
                'rounded border px-3 text-sm ' +
                (scope === v ? 'border-primary bg-primary text-paper' : 'border-rule text-ink-2')
              }
              style={{ minHeight: 44 }}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Card({
  title,
  note,
  detail,
  onClick,
  children,
}: {
  title: string
  note: string
  detail: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="mb-3 rounded border border-rule p-3">
      <button onClick={onClick} className="w-full text-left" style={{ minHeight: 44 }}>
        <div className="flex items-baseline gap-2">
          <span className="font-bold">{title}</span>
          <span className="text-xs text-ink-3 tabular">{note}</span>
          <span className="ml-auto text-sm text-primary">印刷 ›</span>
        </div>
        <div className="text-xs text-ink-2">{detail}</div>
      </button>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------

function PrintView({
  kind,
  scope,
  tournament,
  groups,
  matches,
  rules,
  idx,
  getStandings,
  onBack,
}: Props & { kind: Kind; scope: 'all' | 'pending'; onBack: () => void }) {
  // 団体戦の対戦を、同じ tieId でまとめる。1対戦が用紙1枚になる。
  const tieGroups = (() => {
    if (kind !== 'referee') return [] as MatchRecord[][]
    const by = new Map<string, MatchRecord[]>()
    for (const m of matches) {
      if (!m.tieId) continue
      const arr = by.get(m.tieId)
      if (arr) arr.push(m)
      else by.set(m.tieId, [m])
    }
    return [...by.values()].sort((x, y) => (x[0].number ?? 0) - (y[0].number ?? 0))
  })()

  const sheets =
    kind === 'scoresheets'
      ? (scope === 'pending' ? matches.filter((m) => m.status !== 'COMPLETED') : matches)
      : []

  // 審判の割当は時間割があって初めて決まる。
  // **トーナメントの試合は時刻を持たない**ので、ここへ渡すと時刻の解釈で落ちる。
  const scheduled = matches.filter((m) => m.scheduledAt !== null && m.courtId !== null)
  const refs = assignReferees(
    scheduled.map((m) => ({
      blockId: m.groupId ?? '',
      blockLabel: idx.blockLabel(m.groupId),
      numberInGroup: m.numberInGroup ?? 0,
      number: m.number ?? 0,
      entryIds: [m.entryIds[0] ?? '', m.entryIds[1] ?? ''] as [string, string],
      slotPair: [1, 2] as [number, number],
      round: m.round,
      court: Number(m.courtId?.replace('c', '') ?? 1),
      scheduledAt: m.scheduledAt ?? '',
      scoringRuleId: m.scoringRuleId,
    })),
    { style: 'LOSER', firstMatchRefereeRow: 3, courtCount: tournament.courts.length },
  )
  const refByNumber = new Map(refs.map((r) => [r.matchNumber, r.note]))

  // 順位は印刷の直前に計算する。画面で見ているものと必ず同じになる。
  const [standings, setStandings] = useState<Record<string, RankingResult>>({})
  useEffect(() => {
    if (kind !== 'standings') return
    let alive = true
    void (async () => {
      const out: Record<string, RankingResult> = {}
      for (const g of groups) {
        try {
          out[g.id] = await getStandings(g.id)
        } catch {
          // 集計できないブロックは空欄のまま刷る。止めない（docs/13）。
        }
      }
      if (alive) setStandings(out)
    })()
    return () => {
      alive = false
    }
  }, [kind, groups, getStandings])

  return (
    <div className="h-full overflow-y-auto bg-rule-2/30">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-rule bg-paper px-3 py-2 no-print">
        <button onClick={onBack} className="rounded border border-rule px-3 text-sm" style={{ minHeight: 44 }}>
          ‹ 戻る
        </button>
        <span className="text-sm text-ink-2">
          {kind === 'standings'
            ? '星取表'
            : kind === 'timetable'
              ? 'タイムテーブル'
              : kind === 'referee'
                ? `審判用紙 ${tieGroups.length}枚`
                : `スコアシート ${sheets.length}枚`}
        </span>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded bg-primary px-4 font-bold text-paper"
          style={{ minHeight: 44 }}
        >
          印刷する
        </button>
      </div>

      <div className="print-root bg-paper p-4">
        {kind === 'standings' &&
          groups.map((g) => (
            <PrintStandings
              key={g.id}
              group={g}
              matches={matches.filter((m) => m.groupId === g.id)}
              rules={rules}
              idx={idx}
              tournament={tournament}
              result={standings[g.id] ?? null}
            />
          ))}

        {kind === 'referee' &&
          tieGroups.map((ms) => (
            <PrintRefereeSheet
              key={ms[0].tieId}
              matches={ms}
              idx={idx}
              rules={rules}
              tournament={tournament}
            />
          ))}

        {kind === 'timetable' && (
          <PrintTimetable
            matches={matches}
            courtCount={tournament.courts.length}
            idx={idx}
            tournament={tournament}
            refByNumber={refByNumber}
          />
        )}

        {kind === 'scoresheets' &&
          sheets.map((m) => (
            <PrintScoresheet
              key={m.id}
              match={m}
              rules={rules}
              idx={idx}
              tournament={tournament}
              refereeNote={refByNumber.get(m.number ?? 0) ?? ''}
            />
          ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * 星取表。**愛知県バドミントン協会の大会プログラムと同じ書式に合わせる。**
 *
 * 見比べて「同じもの」と言えることが導入の条件になる（docs/17）。
 * 協会の書式は次のとおり（第101回プログラム 44〜58ページ）。
 *
 *   ・列の見出しが**チーム名／選手名**。番号ではない
 *   ・マスの**右上に小さく対戦番号**。1つだけ
 *   ・自分同士のマスは**斜線**
 *   ・右端は「勝 敗」と「順位」の2列
 *   ・A4縦に4ブロック
 *
 * 結果が入っていなければそのまま記入用紙になり、入っていれば掲示用になる。
 * **同じ印刷が両方を兼ねる。**運営者に選ばせる必要がない。
 */
function PrintStandings({
  group,
  matches,
  rules,
  idx,
  tournament,
  result,
}: {
  group: GroupRecord
  matches: MatchRecord[]
  rules: ScoringRuleRecord[]
  idx: Indexes
  tournament: TournamentRecord
  result?: RankingResult | null
}) {
  const ids = group.entryIds
  const rule = rules.find((r) => r.id === matches[0]?.scoringRuleId)
  const isTeam = matches.some((m) => m.tieId !== null)
  const rankOf = (id: string) => result?.entries.find((e) => e.entryId === id)

  return (
    <section className="print-block mb-6">
      <div className="mb-0.5 flex items-baseline gap-3">
        <h2 className="text-base font-bold">{idx.blockLabel(group.id)}</h2>
        {rule && <span className="text-[10px]">{describeRule(rule).replace('この種目は ', '')}</span>}
        <span className="ml-auto text-[10px] text-ink-2">
          {tournament.name} / {tournament.date}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="w-[22%] border border-ink px-1 py-1 text-left font-bold">
              {idx.blockLabel(group.id)}
            </th>
            {ids.map((b) => (
              <th key={b} className="border border-ink px-0.5 py-1 font-normal leading-tight">
                <span className="block truncate">{idx.entryLabel(b)}</span>
              </th>
            ))}
            <th className="w-[9%] border border-ink px-1 py-1 font-bold">勝 敗</th>
            <th className="w-[6%] border border-ink px-1 py-1 text-[9px] font-normal leading-tight">
              順位
            </th>
          </tr>
        </thead>
        <tbody>
          {ids.map((a, i) => {
            const r = rankOf(a)
            return (
              <tr key={a}>
                <td className="border border-ink px-1 py-1 leading-tight">
                  <span className="block truncate">{idx.entryLabel(a)}</span>
                  {!isTeam && (
                    <span className="block truncate text-[9px] text-ink-2">
                      {idx.entryAffiliation(a)}
                    </span>
                  )}
                </td>
                {ids.map((b, j) => {
                  if (i === j) {
                    // 自分同士。協会の書式は斜線を引く。
                    return (
                      <td key={j} className="relative border border-ink p-0">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                          <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        </svg>
                      </td>
                    )
                  }
                  const v = cellView(matches, a, b)
                  return (
                    <td key={j} className="border border-ink px-0.5 pb-1 pt-0 align-top">
                      {/* 対戦番号は右上に小さく。協会の書式と同じ位置 */}
                      <div className="text-right text-[8px] leading-none text-ink-2 tabular">
                        {v?.head.numberInGroup ?? ''}
                      </div>
                      <div className="text-center text-[11px] leading-tight tabular">
                        {v?.done ? `${v.won ? '○' : '●'}${v.score ?? ''}` : ''}
                      </div>
                    </td>
                  )
                })}
                <td className="border border-ink text-center tabular">
                  {r ? `${r.stats.wins}-${r.stats.losses}` : ''}
                </td>
                <td className="border border-ink text-center font-bold tabular">{r?.rank ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function PrintTimetable({
  matches,
  courtCount,
  idx,
  tournament,
  refByNumber,
}: {
  matches: MatchRecord[]
  courtCount: number
  idx: Indexes
  tournament: TournamentRecord
  refByNumber: Map<number, string>
}) {
  const times = [...new Set(matches.map((m) => m.scheduledAt))].sort()
  return (
    <section>
      <div className="mb-1 flex items-baseline gap-3">
        <h2 className="text-lg font-bold">タイムテーブル</h2>
        <span className="text-xs">
          {tournament.date} {tournament.venue}
        </span>
        <span className="ml-auto text-xs">タイムテーブルは目安です</span>
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="w-10 border border-ink px-1 py-0.5 font-normal">時刻</th>
            {Array.from({ length: courtCount }, (_, i) => (
              <th key={i} className="border border-ink px-1 py-0.5 font-normal">
                {i + 1}コート
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => (
            <tr key={t}>
              <td className="border border-ink px-1 text-right tabular">{t}</td>
              {Array.from({ length: courtCount }, (_, c) => {
                const m = matches.find((x) => x.scheduledAt === t && x.courtId === `c${c + 1}`)
                if (!m) return <td key={c} className="border border-ink" />
                return (
                  <td key={c} className="border border-ink px-1 py-0.5 text-center">
                    <div className="font-bold tabular">{m.number}</div>
                    <div className="leading-tight">{idx.blockLabel(m.groupId)}</div>
                    <div className="leading-tight">{circled(m.numberInGroup)}</div>
                    <div className="leading-tight text-ink-2">{refByNumber.get(m.number ?? 0)}</div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function PrintScoresheet({
  match,
  rules,
  idx,
  tournament,
  refereeNote,
}: {
  match: MatchRecord
  rules: ScoringRuleRecord[]
  idx: Indexes
  tournament: TournamentRecord
  refereeNote: string
}) {
  const rule = rules.find((r) => r.id === match.scoringRuleId) ?? rules[0]
  if (!rule) return null

  const namesOf = (entryId: string | null): string[] => {
    if (!entryId) return ['', '']
    const e = idx.entryById.get(entryId)
    if (!e) return ['', '']
    const ns = e.playerIds.map((id) => idx.playerById.get(id)?.name ?? '')
    return ns.length > 0 ? ns : ['']
  }

  const sheet: Scoresheet = buildScoresheet({
    number: match.number,
    numberInGroup: match.numberInGroup,
    tournamentName: tournament.name,
    date: tournament.date,
    venue: tournament.venue,
    eventName: idx.eventById.get(match.eventId)?.name ?? '',
    // blockLabel は種目名を含むので、組名だけを取り出す（種目欄で重複させない）
    // 団体戦では、その対戦のどの枠かを紙にも刷る。
    // 審判が「第1ダブルスの用紙」を取り違えると、あとから復元できない。
    blockName: [
      idx.groupById.get(match.groupId ?? '')?.name ?? '',
      match.lineupSlot ?? '',
    ]
      .filter(Boolean)
      .join(' ・ '),
    courtName: `${match.courtId?.replace('c', '')}番コート`,
    scheduledAt: match.scheduledAt ?? '',
    sideA: { names: namesOf(match.entryIds[0]), affiliation: idx.entryAffiliation(match.entryIds[0]) },
    sideB: { names: namesOf(match.entryIds[1]), affiliation: idx.entryAffiliation(match.entryIds[1]) },
    rule,
    ruleLabel: describeRule(rule).replace('この種目は ', ''),
    refereeNote,
    inputUrl: '',
  })

  return <ScoresheetSheet sheet={sheet} />
}

/**
 * フルグリッド版のスコアシート。**公式フォーマット（A4横）の構造に合わせる。**
 *
 *   年度 / 大会名 ─────── スコアシート ─────── コート / 番号
 *   ┌──────┬────────────┬──────────┬────────────┐
 *   │ 種目  │ 選手名・所属  │スコア(ゲーム)│ 選手名・所属  │
 *   └──────┴────────────┴──────────┴────────────┘
 *   ┌─┬────────┬──────────────────────────┐
 *   │1│（4行）    │ 42マスの得点欄。中央に太線でペアを分ける │
 *   ├─┼────────┼──────────────────────────┤
 *   │2│ …
 *   勝者氏名 ── 主審署名 ── 開始時刻 ── 終了時刻
 *
 * **選手名は上部の情報欄に1回だけ書く。** 各段の左には小さく再掲する
 * （どの行が誰かを記録者が見失わないため）。
 */
export function ScoresheetSheet({ sheet }: { sheet: Scoresheet }) {
  const half = Math.ceil(sheet.rows.length / 2)
  const sideA = sheet.rows.slice(0, half)
  const sideB = sheet.rows.slice(half)

  return (
    <section className="print-page mb-6">
      {/* 上部：大会名 ── スコアシート ── コート / 番号 */}
      <div className="mb-1 flex items-baseline gap-3 text-[11px]">
        <span>
          <span className="font-medium">{sheet.tournamentName}</span>
        </span>
        <span className="text-ink-2">{sheet.date}</span>
        <span className="flex-1 text-center text-sm font-bold tracking-[0.3em]">スコアシート</span>
        <span>
          コート <span className="font-medium">{sheet.courtName.replace('番コート', '')}</span>
        </span>
        <span>
          番号 <span className="text-base font-bold tabular">{sheet.number}</span>
        </span>
      </div>

      {/* 情報欄。左右に選手名、中央にスコア */}
      <table className="mb-1.5 w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="w-20 border border-ink px-1 py-0.5 font-normal">種目</th>
            <th className="border border-ink px-1 py-0.5 font-normal">選手名・所属</th>
            <th className="w-32 border border-ink px-1 py-0.5 font-normal">スコア（ゲーム）</th>
            <th className="border border-ink px-1 py-0.5 font-normal">選手名・所属</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-ink px-1 py-1 text-center align-middle leading-tight">
              <div className="font-medium">{sheet.eventName}</div>
              <div className="text-[9px] text-ink-2">{sheet.blockName}</div>
            </td>
            <td className="border border-ink px-2 py-1 align-middle">
              {sideA.map((r, i) => (
                <div key={i} className="leading-snug">
                  <span className="font-medium">{r.name}</span>
                  {i === sideA.length - 1 && (
                    <span className="ml-1 text-[9px] text-ink-2">（{r.affiliation}）</span>
                  )}
                </div>
              ))}
            </td>
            <td className="border border-ink px-2 py-1 text-center align-middle">
              {[0, 1, 2].slice(0, Math.min(3, sheet.games.length)).map((i) => (
                <div key={i} className="my-0.5 flex items-center justify-center gap-1">
                  <span className="inline-block w-8 border-b border-ink" />
                  <span className="text-ink-2">−</span>
                  <span className="inline-block w-8 border-b border-ink" />
                </div>
              ))}
            </td>
            <td className="border border-ink px-2 py-1 align-middle">
              {sideB.map((r, i) => (
                <div key={i} className="leading-snug">
                  <span className="font-medium">{r.name}</span>
                  {i === sideB.length - 1 && (
                    <span className="ml-1 text-[9px] text-ink-2">（{r.affiliation}）</span>
                  )}
                </div>
              ))}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 得点欄。ゲームごとに1段 */}
      {sheet.games.map((g, gi) => (
        <table key={gi} className="mb-1 w-full border-collapse">
          <tbody>
            {sheet.rows.map((r, ri) => {
              // ペアの境界に太線を引く（上2行がAサイド、下2行がBサイド）
              const boundary = ri === half - 1
              return (
                <tr key={ri}>
                  {ri === 0 && (
                    <td
                      rowSpan={sheet.rows.length}
                      className="w-6 border border-ink text-center align-middle text-sm font-bold"
                    >
                      {gi + 1}
                    </td>
                  )}
                  {/* 選手名の再掲。どの行が誰かを見失わないため */}
                  <td
                    className={
                      'w-24 border-x border-ink px-1 text-[8px] leading-none ' +
                      (ri === 0 ? 'border-t ' : '') +
                      (ri === sheet.rows.length - 1 ? 'border-b ' : '') +
                      (boundary ? 'border-b-2 border-b-ink ' : 'border-b border-b-rule ')
                    }
                    style={{ height: 17 }}
                  >
                    {r.name}
                  </td>
                  {/* S / R の記入欄 */}
                  <td
                    className={
                      'w-5 border-x border-ink ' +
                      (ri === 0 ? 'border-t ' : '') +
                      (ri === sheet.rows.length - 1 ? 'border-b ' : '') +
                      (boundary ? 'border-b-2 border-b-ink ' : 'border-b border-b-rule ')
                    }
                  />
                  {/* 得点マス */}
                  {Array.from({ length: g.columns }, (_, ci) => (
                    <td
                      key={ci}
                      className={
                        'border-r border-r-rule ' +
                        (ci === g.columns - 1 ? 'border-r-ink ' : '') +
                        (ri === 0 ? 'border-t border-t-ink ' : '') +
                        (ri === sheet.rows.length - 1 ? 'border-b border-b-ink ' : '') +
                        (boundary ? 'border-b-2 border-b-ink ' : 'border-b border-b-rule ')
                      }
                    />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      ))}

      {/* 下部 */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 pt-1 text-[10px]">
        <span>
          勝者氏名 <span className="inline-block w-28 border-b border-ink" />
        </span>
        <span>
          主審署名 <span className="inline-block w-28 border-b border-ink" />
        </span>
        <span>
          開始時刻 <span className="inline-block w-14 border-b border-ink" />
        </span>
        <span>
          終了時刻 <span className="inline-block w-14 border-b border-ink" />
        </span>
        <span className="ml-auto text-ink-2">{sheet.ruleLabel}</span>
      </div>
      {sheet.refereeNote && (
        <div className="mt-0.5 text-[9px] text-ink-2">審判：{sheet.refereeNote}</div>
      )}
      <div className="mt-0.5 text-[8px] text-ink-2">
        得点したペアの、次にサービスをする選手の行に記入してください。最初は両方に 0 を記入します。
        {sheet.deuceFrom !== null && ` ${sheet.deuceFrom}オールになったら次の欄に斜め線を入れてください。`}
      </div>
    </section>
  )
}

/**
 * 団体戦の審判用紙。1対戦で1枚。
 *
 * 愛知県バドミントン協会が実際に使っている用紙に合わせている（`src/ui/refereeSheet.ts`）。
 * 右上の記入欄は**欄があるだけで、ほとんど主審とシャトル数しか書かれない**。
 * それでも欄は残す。用紙の体裁が変わると現場が戸惑う。
 */
function PrintRefereeSheet({
  matches,
  idx,
  rules,
  tournament,
}: {
  matches: MatchRecord[]
  idx: Indexes
  rules: ScoringRuleRecord[]
  tournament: TournamentRecord
}) {
  const head = matches[0]
  const rule = rules.find((r) => r.id === head.scoringRuleId)
  const [a, b] = head.entryIds
  const cols = rule ? columnsPerGame(rule) : OFFICIAL_COLUMNS
  const games = rule?.gamesPerMatch ?? 3

  return (
    <section className="print-page mb-8 break-after-page border border-ink p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-ink-2">
            {tournament.name} / {tournament.date} / {tournament.venue}
          </div>
          <h2 className="mt-0.5 text-base font-bold">審判用紙</h2>
          <div className="mt-0.5 text-xs">
            {idx.blockLabel(head.groupId)}
            {head.scheduledAt ? ` ・ ${head.scheduledAt}` : ''}
            {head.courtId ? ` ・ ${head.courtId.replace('c', '')}番コート` : ''}
          </div>
        </div>

        {/* 右上の記入欄。協会の用紙と同じ並び。 */}
        <table className="shrink-0 border-collapse text-[9px]">
          <tbody>
            <tr>
              {REFEREE_FIELDS.map((f) => (
                <th
                  key={f.key}
                  className="whitespace-nowrap border border-ink px-1 py-0.5 font-normal text-ink-2"
                >
                  {f.label}
                </th>
              ))}
            </tr>
            <tr>
              {REFEREE_FIELDS.map((f) => (
                <td
                  key={f.key}
                  className="border border-ink"
                  style={{
                    height: 22,
                    // よく書かれる欄（主審・シャトル数）だけ少し広く取る。
                    minWidth: OFTEN_FILLED.includes(f.key) ? 56 : f.width === 'narrow' ? 34 : 44,
                  }}
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="truncate text-sm font-bold">{idx.entryLabel(a)}</div>
        <div className="text-xs text-ink-2">対</div>
        <div className="truncate text-sm font-bold">{idx.entryLabel(b)}</div>
      </div>

      {matches.map((m) => (
        <div key={m.id} className="mt-2 border border-ink">
          <div className="flex items-center gap-2 border-b border-ink bg-rule-2/40 px-2 py-0.5 text-[10px]">
            <span className="font-bold">{m.lineupSlot ?? ''}</span>
            <span className="text-ink-2">第{m.number}試合</span>
            <span className="ml-auto text-ink-2">
              {rule ? describeRule(rule).replace('この種目は ', '').replace('の設定です', '') : ''}
            </span>
          </div>
          {/* 選手名の欄。オーダーが出ていれば入り、出ていなければ空欄のまま。 */}
          <div className="grid grid-cols-2 border-b border-ink text-[10px]">
            <div className="border-r border-ink px-2 py-1" style={{ minHeight: 30 }}>
              <span className="text-ink-2">{idx.entryLabel(a)}</span>
            </div>
            <div className="px-2 py-1" style={{ minHeight: 30 }}>
              <span className="text-ink-2">{idx.entryLabel(b)}</span>
            </div>
          </div>
          {/* ゲームごとのマス。スコアシートと同じフルグリッド */}
          {Array.from({ length: games }, (_, g) => (
            <div key={g} className="flex border-b border-ink last:border-b-0">
              <div className="w-6 shrink-0 border-r border-ink text-center text-[9px] leading-[18px] text-ink-2">
                {g + 1}G
              </div>
              <div className="flex-1">
                {[0, 1].map((row) => (
                  <div key={row} className="flex border-b border-rule last:border-b-0">
                    {Array.from({ length: cols }, (_, c) => (
                      <div
                        key={c}
                        className="border-r border-rule-2 last:border-r-0"
                        style={{ width: `${100 / cols}%`, height: 16 }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="mt-1 text-[9px] text-ink-2">
        試合が終わったら、敗者チームがこの用紙とシャトルを本部へお願いします。
      </div>
    </section>
  )
}
