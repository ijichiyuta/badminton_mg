// 印刷。docs/07 F-9 / docs/15-ui-ux.md 第2部10
//
// 紙は一級市民（UX原則7）。会場掲示と本部控えのために印刷は必須。
// 「印刷セット」を主役にする。必要な紙が1操作で全部出ることが、
// 手伝いの人へ作業を委譲する前提になる（O-5-3）。

import { useState } from 'react'
import { describeRule } from '../../domain/scoring'
import { buildScoresheet, type Scoresheet } from '../scoresheet'
import { assignReferees } from '../../domain/schedule'
import { circled, type Indexes } from '../useApp'
import type {
  GroupRecord,
  MatchRecord,
  ScoringRuleRecord,
  TournamentRecord,
} from '../../store/schema'

type Kind = 'standings' | 'timetable' | 'scoresheets'

interface Props {
  tournament: TournamentRecord
  groups: GroupRecord[]
  matches: MatchRecord[]
  rules: ScoringRuleRecord[]
  idx: Indexes
}

export function PrintScreen({ tournament, groups, matches, rules, idx }: Props) {
  const [kind, setKind] = useState<Kind | null>(null)
  const [scope, setScope] = useState<'all' | 'pending'>('pending')

  if (kind) {
    return (
      <PrintView
        kind={kind}
        scope={scope}
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
  onBack,
}: Props & { kind: Kind; scope: 'all' | 'pending'; onBack: () => void }) {
  const sheets =
    kind === 'scoresheets'
      ? (scope === 'pending' ? matches.filter((m) => m.status !== 'COMPLETED') : matches)
      : []

  const refs = assignReferees(
    matches.map((m) => ({
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

  return (
    <div className="h-full overflow-y-auto bg-rule-2/30">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-rule bg-paper px-3 py-2 no-print">
        <button onClick={onBack} className="rounded border border-rule px-3 text-sm" style={{ minHeight: 44 }}>
          ‹ 戻る
        </button>
        <span className="text-sm text-ink-2">
          {kind === 'standings' ? '星取表' : kind === 'timetable' ? 'タイムテーブル' : `スコアシート ${sheets.length}枚`}
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

function PrintStandings({
  group,
  matches,
  rules,
  idx,
  tournament,
}: {
  group: GroupRecord
  matches: MatchRecord[]
  rules: ScoringRuleRecord[]
  idx: Indexes
  tournament: TournamentRecord
}) {
  const ids = group.entryIds
  const rule = rules.find((r) => r.id === matches[0]?.scoringRuleId)
  const cell = (a: string, b: string) =>
    matches.find(
      (m) =>
        (m.entryIds[0] === a && m.entryIds[1] === b) || (m.entryIds[0] === b && m.entryIds[1] === a),
    )

  return (
    <section className="print-page mb-8">
      <div className="mb-1 flex items-baseline gap-3">
        <h2 className="text-lg font-bold">{idx.blockLabel(group.id)}</h2>
        {rule && <span className="text-xs">{describeRule(rule).replace('この種目は ', '')}</span>}
        <span className="ml-auto text-xs text-ink-2">
          {tournament.name} / {tournament.date}
        </span>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-ink px-2 py-1 text-left text-xs font-normal">所属 / 氏名</th>
            {ids.map((_, j) => (
              <th key={j} className="w-14 border border-ink px-1 py-1 text-xs font-normal">
                {j + 1}
              </th>
            ))}
            <th className="w-14 border border-ink px-1 py-1 text-xs font-normal">勝敗</th>
            <th className="w-12 border border-ink px-1 py-1 text-xs font-normal">順位</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((a, i) => (
            <tr key={a}>
              <td className="border border-ink px-2 py-1">
                <div className="text-xs">
                  {i + 1}. {idx.entryAffiliation(a)}
                </div>
                <div className="font-medium leading-tight">{idx.entryLabel(a)}</div>
              </td>
              {ids.map((b, j) => {
                if (i === j) return <td key={j} className="border border-ink bg-rule-2" />
                const m = cell(a, b)
                const upper = j > i
                return (
                  <td key={j} className="border border-ink px-1 py-1 text-center align-middle">
                    <div className="text-xs tabular">
                      {upper ? m?.number : circled(m?.numberInGroup ?? null)}
                    </div>
                  </td>
                )
              })}
              <td className="border border-ink" />
              <td className="border border-ink" />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-[10px] text-ink-2">
        丸数字＝ブロック内の試合順 / 算用数字＝大会全体の通し番号
      </div>
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
    blockName: idx.groupById.get(match.groupId ?? '')?.name ?? '',
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
