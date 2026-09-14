// ホーム画面。docs/15-ui-ux.md 第2部4 / docs/13-operator-load.md O-4-1
//
// 機能メニューではなく**行動リスト**にする。次に何をすべきかを提示する。
// 警告は該当0件なら行ごと消す。「0件」は表示しない。

import type { MatchRecord } from '../../store/schema'
import type { Indexes } from '../useApp'

interface Props {
  matches: MatchRecord[]
  idx: Indexes
  courtCount: number
  onOpenMatch: (m: MatchRecord) => void
  save: {
    supported: boolean
    linked: boolean
    fileName: string | null
    lastWrittenAt: string | null
  }
  onChooseFile: () => void
  onExport: () => void
  /** いま開いているのが見本の大会か。 */
  isDemo: boolean
  /** 自分の大会を作る画面へ。 */
  onStart: () => void
}

/** 結果が入っていないまま時間が経った試合とみなす閾値（枠数）。 */
const STALE_SLOTS = 1

export function HomeScreen({
  matches,
  idx,
  courtCount,
  onOpenMatch,
  save,
  onChooseFile,
  onExport,
  isDemo,
  onStart,
}: Props) {
  const done = matches.filter((m) => m.status === 'COMPLETED')
  const pending = matches.filter((m) => m.status !== 'COMPLETED')

  // 進行中とみなす枠＝未入力のうち最も早い時刻。
  const currentSlot = pending[0]?.scheduledAt ?? null
  const slots = [...new Set(matches.map((m) => m.scheduledAt))].sort()
  const slotIndex = new Map(slots.map((t, i) => [t, i]))
  const curIdx = currentSlot ? (slotIndex.get(currentSlot) ?? 0) : slots.length

  // 次に呼ぶ試合。2試合先まで出して呼びに行く回数を減らす（O-5-2）。
  const next = pending.slice(0, courtCount + 2)

  // 前の枠なのに未入力＝結果が届いていない。
  const stale = pending.filter((m) => (slotIndex.get(m.scheduledAt) ?? 0) < curIdx - STALE_SLOTS + 1)

  const byEvent = new Map<string, { done: number; total: number }>()
  for (const m of matches) {
    const label = idx.eventById.get(m.eventId)?.name ?? '—'
    const cur = byEvent.get(label) ?? { done: 0, total: 0 }
    cur.total++
    if (m.status === 'COMPLETED') cur.done++
    byEvent.set(label, cur)
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      {/*
        初めて開いた人は、入っている見本を自分の大会だと思う。
        **何より先に、これが見本だと伝える。**
        触って試してもらうために消しはしない。自分の大会を作れば自然に置き換わる。
      */}
      {isDemo && (
        <div className="mb-3 rounded border border-warn bg-warn-soft px-3 py-3">
          <div className="text-sm font-bold text-warn">これは操作を試すための見本です</div>
          <div className="mt-1 text-sm text-ink-2">
            ここに出ている大会・選手・試合はすべて架空のものです。
            自由に触って確かめてください。何をしても壊れません。
          </div>
          <button
            onClick={onStart}
            className="mt-3 w-full rounded bg-primary py-3 text-base font-bold text-paper"
            style={{ minHeight: 52 }}
          >
            自分の大会を作る
          </button>
        </div>
      )}

      {pending.length === 0 ? (
        <div className="rounded border border-ok bg-ok-soft px-3 py-6 text-center">
          <div className="text-lg font-bold text-ok">すべて入力済みです</div>
          <div className="mt-1 text-sm text-ink-2">結果を印刷して掲示できます</div>
        </div>
      ) : (
        <>
          <Section title={`次に呼ぶ試合`} note={`${currentSlot ?? ''} の枠`}>
            <div className="flex flex-col">
              {next.slice(0, courtCount).map((m) => (
                <MatchRow key={m.id} m={m} idx={idx} onClick={() => onOpenMatch(m)} />
              ))}
            </div>
            {next.length > courtCount && (
              <div className="mt-1 border-t border-rule-2 pt-1">
                <div className="mb-1 text-xs text-ink-3">そのあと</div>
                {next.slice(courtCount).map((m) => (
                  <MatchRow key={m.id} m={m} idx={idx} onClick={() => onOpenMatch(m)} compact />
                ))}
              </div>
            )}
          </Section>

          {stale.length > 0 && (
            <Section title="結果が届いていない" warn note={`${stale.length}件`}>
              {stale.slice(0, 5).map((m) => (
                <MatchRow key={m.id} m={m} idx={idx} onClick={() => onOpenMatch(m)} />
              ))}
            </Section>
          )}
        </>
      )}

      <Section
        title="記録の控え"
        note={save.linked ? '自動で控えを取っています' : 'まだ控えを取っていません'}
        warn={!save.linked}
      >
        {save.linked ? (
          <div className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-ok">✓</span>
              <span className="min-w-0 truncate font-medium">{save.fileName}</span>
            </div>
            <div className="mt-0.5 text-xs text-ink-2">
              1試合入れるたびに、このファイルへ自動で書いています
              {save.lastWrittenAt && ` · 最終 ${save.lastWrittenAt.slice(11, 16)}`}
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <p className="mb-2 text-ink-2">
              {save.supported
                ? '入れた結果はこの端末に残ります。控えのファイルを1つ決めておくと、1試合ごとに自動で書き写します。USBメモリでもパソコンの中でもかまいません。'
                : 'このブラウザは自動の書き写しに対応していません（Chrome か Edge なら対応）。ときどき「いま控えを取る」を押してください。'}
            </p>
            <div className="flex flex-wrap gap-2">
              {save.supported && (
                <button
                  onClick={onChooseFile}
                  className="rounded bg-primary px-4 font-bold text-paper"
                  style={{ minHeight: 44 }}
                >
                  控えの置き場所を決める
                </button>
              )}
              <button
                onClick={onExport}
                className="rounded border border-rule px-4"
                style={{ minHeight: 44 }}
              >
                いま控えを取る
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="進捗" note={`${done.length} / ${matches.length} 試合`}>
        <div className="flex flex-col gap-1.5">
          {[...byEvent.entries()].map(([label, v]) => (
            <div key={label} className="grid grid-cols-[1fr_5rem_3rem] items-center gap-2 text-sm">
              <span className="truncate">{label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-rule-2">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${Math.round((v.done / v.total) * 100)}%` }}
                />
              </span>
              <span className="text-right text-xs text-ink-2 tabular">
                {Math.round((v.done / v.total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  note,
  warn,
  children,
}: {
  title: string
  note?: string
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-baseline gap-2">
        {warn && <span className="text-warn">⚠</span>}
        <h2 className={'text-sm font-bold ' + (warn ? 'text-warn' : 'text-ink')}>{title}</h2>
        {note && <span className="text-xs text-ink-3 tabular">{note}</span>}
      </div>
      <div className={'rounded border ' + (warn ? 'border-warn bg-warn-soft' : 'border-rule')}>
        <div className="p-2">{children}</div>
      </div>
    </section>
  )
}

function MatchRow({
  m,
  idx,
  onClick,
  compact,
}: {
  m: MatchRecord
  idx: Indexes
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left active:bg-primary-soft"
      style={{ minHeight: 44 }}
    >
      <span className="w-10 shrink-0 text-center text-xs font-bold text-primary tabular">
        {m.courtId?.replace('c', '')}番
      </span>
      <span className="min-w-0 flex-1">
        <span className={'block truncate ' + (compact ? 'text-sm text-ink-2' : 'font-semibold')}>
          {idx.entryLabel(m.entryIds[0])} <span className="text-ink-3">vs</span>{' '}
          {idx.entryLabel(m.entryIds[1])}
        </span>
        <span className="block truncate text-xs text-ink-3">
          第{m.number}試合 · {idx.blockLabel(m.groupId)}
          {m.lineupSlot ? ` · ${m.lineupSlot}` : ''} · {m.scheduledAt}
        </span>
      </span>
      <span className="shrink-0 text-xs text-ink-3">入力 ›</span>
    </button>
  )
}
