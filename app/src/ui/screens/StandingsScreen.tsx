// 星取表。docs/15-ui-ux.md 第2部6 / docs/17-first-customer.md
//
// **現行の紙の書式に合わせる。** 見比べて「同じもの」と言えることが導入の条件。
//
//  ・1エントリー = 所属＋氏名
//  ・マス内に2種類の番号（丸数字＝ブロック内、算用数字＝大会全体の通し番号）
//  ・ヘッダ右に採点方式（ブロックごとに違うため省略しない）

import { useEffect, useState } from 'react'
import { describeRule } from '../../domain/scoring'
import type { RankingResult } from '../../domain/types'
import type { GroupRecord, MatchRecord, ScoringRuleRecord } from '../../store/schema'
import { circled, type Indexes } from '../useApp'

interface Props {
  groups: GroupRecord[]
  matches: MatchRecord[]
  rules: ScoringRuleRecord[]
  idx: Indexes
  getStandings: (groupId: string) => Promise<RankingResult>
  onOpenMatch: (m: MatchRecord) => void
}

export function StandingsScreen({ groups, matches, rules, idx, getStandings, onOpenMatch }: Props) {
  const [selected, setSelected] = useState(groups[0]?.id ?? '')
  const group = groups.find((g) => g.id === selected) ?? groups[0]

  if (!group) return <div className="p-4 text-ink-2">ブロックがありません</div>

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-x-auto border-b border-rule no-print">
        <div className="flex gap-1 p-2">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelected(g.id)}
              className={
                'shrink-0 whitespace-nowrap rounded border px-3 text-sm ' +
                (g.id === selected
                  ? 'border-primary bg-primary text-paper'
                  : 'border-rule text-ink-2')
              }
              style={{ minHeight: 44 }}
            >
              {idx.blockLabel(g.id)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <GroupTable
          key={group.id}
          group={group}
          matches={matches.filter((m) => m.groupId === group.id)}
          rules={rules}
          idx={idx}
          getStandings={getStandings}
          onOpenMatch={onOpenMatch}
        />
      </div>
    </div>
  )
}

export function GroupTable({
  group,
  matches,
  rules,
  idx,
  getStandings,
  onOpenMatch,
}: {
  group: GroupRecord
  matches: MatchRecord[]
  rules: ScoringRuleRecord[]
  idx: Indexes
  getStandings: (groupId: string) => Promise<RankingResult>
  onOpenMatch: (m: MatchRecord) => void
}) {
  const [result, setResult] = useState<RankingResult | null>(null)

  useEffect(() => {
    let alive = true
    void getStandings(group.id).then((r) => {
      if (alive) setResult(r)
    })
    return () => {
      alive = false
    }
  }, [group.id, matches, getStandings])

  const ids = group.entryIds
  const ruleId = matches[0]?.scoringRuleId ?? null
  const rule = rules.find((r) => r.id === ruleId)

  /** i 行 j 列のマスに入る試合。 */
  const cellMatch = (a: string, b: string): MatchRecord | undefined =>
    matches.find(
      (m) =>
        (m.entryIds[0] === a && m.entryIds[1] === b) ||
        (m.entryIds[0] === b && m.entryIds[1] === a),
    )

  const rankOf = (entryId: string) => result?.entries.find((e) => e.entryId === entryId)

  return (
    <div className="p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-bold">{idx.blockLabel(group.id)}</h2>
        {rule && <span className="text-xs text-ink-2">{describeRule(rule).replace('この種目は ', '')}</span>}
        {result && (
          <span
            className={
              'ml-auto rounded px-2 py-0.5 text-xs font-bold ' +
              (result.provisional ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok')
            }
          >
            {result.provisional ? '暫定' : '確定'}
          </span>
        )}
      </div>

      {/* 星取表。横スクロールはこの中だけ。ページ全体を横に振らせない */}
      <div className="overflow-x-auto border border-rule">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 480 }}>
          <thead>
            <tr className="bg-rule-2/60">
              <th className="border-b border-r border-rule px-2 py-1 text-left text-xs font-normal text-ink-3">
                所属 / 氏名
              </th>
              {ids.map((_, j) => (
                <th
                  key={j}
                  className="w-12 border-b border-r border-rule px-1 py-1 text-xs font-normal text-ink-3"
                >
                  {j + 1}
                </th>
              ))}
              <th className="w-14 border-b border-r border-rule px-1 py-1 text-xs font-normal text-ink-3">
                勝敗
              </th>
              <th className="w-12 border-b border-rule px-1 py-1 text-xs font-normal text-ink-3">順位</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((a, i) => {
              const r = rankOf(a)
              return (
                <tr key={a} className="align-top">
                  <td className="border-b border-r border-rule px-2 py-1">
                    <div className="text-xs text-ink-3">
                      {i + 1}. {idx.entryAffiliation(a)}
                    </div>
                    <div className="font-medium leading-tight">{idx.entryLabel(a)}</div>
                  </td>
                  {ids.map((b, j) => {
                    if (i === j) {
                      return <td key={j} className="border-b border-r border-rule bg-rule-2" />
                    }
                    const m = cellMatch(a, b)
                    const upper = j > i
                    const mine = m?.entryIds[0] === a ? 0 : 1
                    const score =
                      m && m.status === 'COMPLETED' && m.games.length > 0
                        ? m.games
                            .map((g) => (mine === 0 ? g.scoreA : g.scoreB))
                            .join('-')
                        : null
                    const won = m?.winnerEntryId === a
                    return (
                      <td
                        key={j}
                        className="cursor-pointer border-b border-r border-rule px-0.5 py-1 text-center align-middle active:bg-primary-soft"
                        onClick={() => m && onOpenMatch(m)}
                      >
                        {/* 上三角＝通し番号、下三角＝丸数字。現行の書式 */}
                        <div className="text-xs leading-tight tabular text-ink-3">
                          {upper ? m?.number : circled(m?.numberInGroup ?? null)}
                        </div>
                        {m?.status === 'COMPLETED' ? (
                          <div
                            className={
                              'text-xs leading-tight tabular ' + (won ? 'font-bold text-ok' : 'text-ink-2')
                            }
                          >
                            {won ? '○' : '●'}
                            <span className="ml-0.5">{score}</span>
                          </div>
                        ) : (
                          <div className="text-xs leading-tight text-ink-3">–</div>
                        )}
                      </td>
                    )
                  })}
                  <td className="border-b border-r border-rule px-1 py-1 text-center tabular">
                    {r ? `${r.stats.wins}-${r.stats.losses}` : '–'}
                  </td>
                  <td className="border-b border-rule px-1 py-1 text-center font-bold tabular">
                    {r ? `${r.rank}位` : '–'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>
          <span className="text-ink-2">①②③</span> ブロック内の試合順
        </span>
        <span>
          <span className="text-ink-2">9 35 61</span> 大会全体の通し番号
        </span>
        <span>空きマスをタップすると入力できます</span>
      </div>

      {/* 順位の根拠。選手に画面を見せて説明するための道具（UX原則10） */}
      {result && result.entries.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-sm font-bold">
            順位{result.provisional ? '（暫定）' : 'が確定しました'}
          </h3>
          <div className="flex flex-col gap-2">
            {result.entries.map((e) => (
              <div key={e.entryId} className="border-l-4 border-rule pl-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold tabular">{e.rank}位</span>
                  <span className="font-medium">{idx.entryLabel(e.entryId)}</span>
                  <span className="text-xs text-ink-3">{idx.entryAffiliation(e.entryId)}</span>
                </div>
                <div className="text-sm text-ink-2">{e.reason}</div>
              </div>
            ))}
          </div>
          {result.warnings.length > 0 && (
            <div className="mt-2 border-l-4 border-warn bg-warn-soft px-3 py-2 text-sm">
              {result.warnings.map((w, i) => (
                <div key={i} className="text-ink-2">
                  ⚠ {w.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
