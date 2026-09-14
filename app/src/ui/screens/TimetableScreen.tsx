// タイムテーブル。docs/15-ui-ux.md 第2部9b
//
// 現行はコート × 時刻のグリッド。この形を保つ。
// 1セル = 通し試合番号 / ブロック名 / ブロック内番号。
// 画面では状態（済 / 進行中 / 待ち）を1行足す。印刷では出さない。

import type { MatchRecord } from '../../store/schema'
import { circled, type Indexes } from '../useApp'

interface Props {
  matches: MatchRecord[]
  courtCount: number
  idx: Indexes
  onOpenMatch: (m: MatchRecord) => void
}

export function TimetableScreen({ matches, courtCount, idx, onOpenMatch }: Props) {
  const times = [...new Set(matches.map((m) => m.scheduledAt))].sort()
  const cols = Math.max(courtCount, ...matches.map((m) => Number(m.courtId?.replace('c', '') ?? 0)))

  // 進行中とみなす枠＝未入力のうち最も早い時刻。
  const current = matches.find((m) => m.status !== 'COMPLETED')?.scheduledAt ?? null

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 pt-3">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="text-base font-bold">タイムテーブル</h2>
          <span className="text-xs text-ink-2 tabular">
            {cols}コート · {matches.length}試合 · {times.length}枠
          </span>
        </div>
        <p className="mb-2 text-xs text-ink-2">
          タイムテーブルは目安です。試合時間・コートは変更することがあります。
        </p>
      </div>

      {/* 横スクロールはこの表の中だけ */}
      <div className="overflow-x-auto px-3 pb-4">
        <table className="w-full border-collapse text-xs" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th className="w-12 border border-rule bg-rule-2/60 px-1 py-1 font-normal text-ink-3">
                時刻
              </th>
              {Array.from({ length: cols }, (_, i) => (
                <th
                  key={i}
                  className="border border-rule bg-rule-2/60 px-1 py-1 font-normal text-ink-3"
                >
                  {i + 1}コート
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((t) => (
              <tr key={t}>
                <td className="border border-rule px-1 py-1 text-right align-middle tabular text-ink-2">
                  {t}
                </td>
                {Array.from({ length: cols }, (_, c) => {
                  const m = matches.find(
                    (x) => x.scheduledAt === t && x.courtId === `c${c + 1}`,
                  )
                  if (!m) return <td key={c} className="border border-rule bg-rule-2/20" />
                  const isCurrent = t === current
                  return (
                    <td
                      key={c}
                      onClick={() => onOpenMatch(m)}
                      className={
                        'cursor-pointer border border-rule px-1 py-1 text-center align-top active:bg-primary-soft ' +
                        (isCurrent ? 'bg-primary-soft/60' : '')
                      }
                    >
                      <div className="font-bold tabular">{m.number}</div>
                      <div className="truncate text-[10px] leading-tight text-ink-2">
                        {idx.blockLabel(m.groupId)}
                      </div>
                      <div className="text-[11px] leading-tight text-primary">
                        {circled(m.numberInGroup)}
                      </div>
                      <StatusChip status={m.status} isCurrent={isCurrent} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 状態は色だけで伝えない。必ず文字を添える（N-5 / UX原則）。 */
function StatusChip({ status, isCurrent }: { status: string; isCurrent: boolean }) {
  if (status === 'COMPLETED') {
    return <div className="text-[10px] leading-tight text-ok">済</div>
  }
  if (isCurrent) {
    return <div className="text-[10px] font-bold leading-tight text-primary">進行中</div>
  }
  return <div className="text-[10px] leading-tight text-ink-3">待ち</div>
}
