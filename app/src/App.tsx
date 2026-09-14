// アプリのシェル。docs/15-ui-ux.md 第2部
//
// 階層は2段まで。下部タブを常時出す。
// 破壊的操作は確認ダイアログではなく Undo トーストで守る（UX原則3）。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HomeScreen } from './ui/screens/HomeScreen'
import { InputScreen } from './ui/screens/InputScreen'
import { StandingsScreen } from './ui/screens/StandingsScreen'
import { TimetableScreen } from './ui/screens/TimetableScreen'
import { useApp, useIndexes } from './ui/useApp'
import type { MatchRecord } from './store/schema'
import type { Game } from './domain/types'

type Tab = 'home' | 'input' | 'standings' | 'timetable'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'input', label: '入力' },
  { id: 'standings', label: '星取表' },
  { id: 'timetable', label: '進行' },
]

type TextSize = 'small' | 'normal' | 'large'

export default function App() {
  const app = useApp()
  const idx = useIndexes(app.data)
  const [tab, setTab] = useState<Tab>('home')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [size, setSize] = useState<TextSize>('normal')

  useEffect(() => {
    document.documentElement.dataset.size = size
  }, [size])

  const matches = app.data?.matches ?? []

  // 開いている試合。指定がなければ最初の未入力。
  const current: MatchRecord | null = useMemo(() => {
    if (currentId) return matches.find((m) => m.id === currentId) ?? null
    return matches.find((m) => m.status !== 'COMPLETED') ?? matches[0] ?? null
  }, [currentId, matches])

  const openMatch = useCallback((m: MatchRecord) => {
    setCurrentId(m.id)
    setTab('input')
  }, [])

  /** 確定したら次の未入力試合へ自動で進む。一覧へ戻らせない（O-3-1）。 */
  const submit = useCallback(
    async (games: Game[]) => {
      if (!current) return
      await app.enterResult(current.id, games)
      const after = matches
        .filter((m) => m.status !== 'COMPLETED' && m.id !== current.id)
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      const next = after.find((m) => (m.number ?? 0) > (current.number ?? 0)) ?? after[0] ?? null
      setCurrentId(next?.id ?? null)
    },
    [app, current, matches],
  )

  const pickByNumber = useCallback(
    (n: number) => {
      const m = matches.find((x) => x.number === n)
      if (m) setCurrentId(m.id)
    },
    [matches],
  )

  if (app.error) {
    return (
      <div className="p-4">
        <div className="border-l-4 border-warn bg-warn-soft p-3">
          <div className="font-bold text-warn">表示できません</div>
          <div className="mt-1 text-sm text-ink-2">{app.error}</div>
          <button onClick={app.reload} className="mt-2 rounded border border-rule px-3 py-2 text-sm">
            もう一度読み込む
          </button>
        </div>
      </div>
    )
  }

  if (!app.data || !idx) {
    return <div className="p-4 text-ink-2">読み込んでいます…</div>
  }

  const t = app.data.tournament
  const courtCount = t.courts.length
  const rule =
    app.data.scoringRules.find((r) => r.id === current?.scoringRuleId) ??
    app.data.scoringRules[0]

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col bg-paper">
      {/* ヘッダ。文字サイズは設定画面ではなく常時アクセスできる位置に置く */}
      <header className="flex items-center gap-2 border-b border-rule px-3 py-2 no-print">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight">{t.name}</div>
          <div className="truncate text-xs text-ink-3">
            {t.date} · {t.venue} · {courtCount}コート
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {(['small', 'normal', 'large'] as TextSize[]).map((s, i) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              aria-label={`文字サイズ ${['小', '標準', '大'][i]}`}
              className={
                'rounded border px-2 ' +
                (size === s ? 'border-primary bg-primary text-paper' : 'border-rule text-ink-2')
              }
              style={{ minHeight: 44, minWidth: 44, fontSize: [12, 15, 19][i] }}
            >
              A
            </button>
          ))}
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {tab === 'home' && (
          <HomeScreen matches={matches} idx={idx} courtCount={courtCount} onOpenMatch={openMatch} />
        )}
        {tab === 'input' &&
          (current && rule ? (
            <InputScreen
              key={current.id}
              match={current}
              rule={rule}
              idx={idx}
              matchCount={matches.length}
              onSubmit={submit}
              onClear={() => void app.clearResult(current.id)}
              onPickNumber={pickByNumber}
            />
          ) : (
            <div className="p-4 text-ink-2">入力できる試合がありません</div>
          ))}
        {tab === 'standings' && (
          <StandingsScreen
            groups={app.data.groups}
            matches={matches}
            rules={app.data.scoringRules}
            idx={idx}
            getStandings={app.getStandings}
            onOpenMatch={openMatch}
          />
        )}
        {tab === 'timetable' && (
          <TimetableScreen
            matches={matches}
            courtCount={courtCount}
            idx={idx}
            onOpenMatch={openMatch}
          />
        )}
      </main>

      {/* Undo トースト。確認ダイアログの代わり。5秒で消す */}
      {app.toast && (
        <Toast
          message={app.toast.message}
          onUndo={
            app.toast.operationId ? () => void app.undo(app.toast!.operationId as string) : null
          }
          onDismiss={() => app.setToast(null)}
        />
      )}

      <nav className="grid grid-cols-4 border-t border-rule no-print">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={
              'py-2 text-sm ' +
              (tab === x.id ? 'font-bold text-primary' : 'text-ink-2')
            }
            style={{ minHeight: 52 }}
          >
            <span
              className={
                'block border-t-2 pt-1 ' + (tab === x.id ? 'border-primary' : 'border-transparent')
              }
            >
              {x.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function Toast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string
  onUndo: (() => void) | null
  onDismiss: () => void
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000)
    return () => clearTimeout(id)
  }, [message, onDismiss])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center px-3 no-print">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-md bg-ink px-3 py-2 text-paper shadow-lg">
        <span className="text-sm">{message}</span>
        {onUndo && (
          <button
            onClick={onUndo}
            className="ml-auto shrink-0 rounded border border-paper/40 px-3 text-sm font-bold"
            style={{ minHeight: 40 }}
          >
            取り消す
          </button>
        )}
      </div>
    </div>
  )
}
