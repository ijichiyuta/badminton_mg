// アプリのシェル。docs/15-ui-ux.md 第2部
//
// 階層は2段まで。下部タブを常時出す。
// 破壊的操作は確認ダイアログではなく Undo トーストで守る（UX原則3）。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEMO_TOURNAMENT_NAME } from './ui/demo'
import { HomeScreen } from './ui/screens/HomeScreen'
import { ShareScreen } from './ui/screens/ShareScreen'
import { InputScreen } from './ui/screens/InputScreen'
import { StandingsScreen } from './ui/screens/StandingsScreen'
import { PrintScreen } from './ui/screens/PrintScreen'
import { SetupScreen } from './ui/screens/SetupScreen'
import { TimetableScreen } from './ui/screens/TimetableScreen'
import { ViewerScreen } from './ui/screens/ViewerScreen'
import { useApp, useIndexes } from './ui/useApp'
import type { MatchRecord } from './store/schema'
import type { Game } from './domain/types'

type Tab = 'home' | 'input' | 'standings' | 'timetable' | 'print' | 'setup'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'input', label: '入力' },
  { id: 'standings', label: '星取表' },
  { id: 'timetable', label: '進行' },
  { id: 'print', label: '印刷' },
  { id: 'setup', label: '設定' },
]

type TextSize = 'small' | 'normal' | 'large'

/** `?view=<大会ID>` で開かれたら閲覧ページ。読むだけで書き込めない。 */
function viewerTarget(): string | null {
  if (typeof location === 'undefined') return null
  return new URLSearchParams(location.search).get('view')
}

export default function App() {
  const viewing = viewerTarget()
  if (viewing) return <ViewerScreen tournamentId={viewing} />
  return <OperatorApp />
}

function OperatorApp() {
  const app = useApp()
  const idx = useIndexes(app.data)
  const [tab, setTab] = useState<Tab>('home')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
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

  /** 棄権も確定と同じ扱い。記録したら次の未入力試合へ進む。 */
  const retire = useCallback(
    async (side: 'A' | 'B' | 'BOTH') => {
      if (!current) return
      await app.enterRetirement(current.id, side)
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

  // 参加者にリンクを渡す画面。公開したあとだけ開ける。
  if (sharing && app.publishState.url) {
    return (
      <ShareScreen
        url={app.publishState.url}
        tournamentName={t.name}
        onBack={() => setSharing(false)}
      />
    )
  }
  const courtCount = t.courts.length
  const rule =
    app.data.scoringRules.find((r) => r.id === current?.scoringRuleId) ??
    app.data.scoringRules[0]

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col bg-paper">
      {/* ヘッダ。文字サイズは設定画面ではなく常時アクセスできる位置に置く */}
      <header className="border-b border-rule px-3 py-1.5 no-print">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-bold leading-tight">{t.name}</span>
          <span className="shrink-0 text-xs text-ink-3 tabular">{t.date}</span>
          <span className="min-w-0 truncate text-xs text-ink-3">{t.venue}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <span className="text-xs text-ink-3 tabular">{courtCount}コート</span>
          <span className="text-xs text-ink-3">·</span>
          <span className="text-xs text-ink-3 tabular">{matches.length}試合</span>
          {app.publishState.configured && (
            <button
              onClick={() => void app.publishNow()}
              disabled={app.publishState.busy}
              aria-label="速報を公開"
              className={
                'ml-auto shrink-0 rounded border px-2 text-xs ' +
                (app.publishState.publishedAt
                  ? 'border-ok text-ok'
                  : 'border-rule text-ink-2')
              }
              style={{ minHeight: 40 }}
            >
              {app.publishState.busy
                ? '送信中'
                : app.publishState.error
                  ? '未同期'
                  : app.publishState.publishedAt
                    ? `公開 ${app.publishState.publishedAt.slice(11, 16)}`
                    : '速報を公開'}
            </button>
          )}
          {app.publishState.url && (
            <button
              onClick={() => setSharing(true)}
              className="shrink-0 rounded border border-primary px-2 text-xs text-primary"
              style={{ minHeight: 40 }}
            >
              配る
            </button>
          )}
          {(['small', 'normal', 'large'] as TextSize[]).map((s, i) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              aria-label={`文字サイズ ${['小', '標準', '大'][i]}`}
              className={
                'shrink-0 rounded border px-1.5 ' +
                (size === s ? 'border-primary bg-primary text-paper' : 'border-rule text-ink-2')
              }
              style={{ minHeight: 40, minWidth: 40, fontSize: [11, 14, 17][i] }}
            >
              A
            </button>
          ))}
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {tab === 'home' && (
          <HomeScreen
            isDemo={t.name === DEMO_TOURNAMENT_NAME}
            onStart={() => setTab('setup')}
            matches={matches}
            idx={idx}
            courtCount={courtCount}
            onOpenMatch={openMatch}
            save={app.saveState}
            onChooseFile={() => void app.chooseFile()}
            onExport={() => void app.exportFile()}
          />
        )}
        {tab === 'input' &&
          (current && rule ? (
            <InputScreen
              key={current.id}
              match={current}
              rule={rule}
              idx={idx}
              matchCount={matches.length}
              siblings={
                current.tieId ? matches.filter((m) => m.tieId === current.tieId) : []
              }
              onSubmit={submit}
              onRetire={(side) => void retire(side)}
              onClear={() => void app.clearResult(current.id)}
              onPickNumber={pickByNumber}
            />
          ) : (
            <div className="p-4 text-ink-2">入力できる試合がありません</div>
          ))}
        {tab === 'standings' && (
          <StandingsScreen
            groups={app.data.groups}
            stages={app.data.stages}
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
        {tab === 'print' && (
          <PrintScreen
            getStandings={app.getStandings}
            tournament={t}
            groups={app.data.groups}
            matches={matches}
            rules={app.data.scoringRules}
            idx={idx}
          />
        )}
        {tab === 'setup' && (
          <SetupScreen
            tournament={t}
            events={app.data.events}
            stages={app.data.stages}
            groups={app.data.groups}
            idx={idx}
            actions={app.setupActions}
            onFinish={() => setTab('home')}
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

      <nav className="grid grid-cols-6 border-t border-rule no-print">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={
              'py-2 text-xs ' +
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
    // **12秒。**5秒では、紙から目を上げて画面を見るまでに消えてしまう。
    // 取り消しは確認ダイアログの代わりなので、気づけない長さでは意味がない。
    const id = setTimeout(onDismiss, 12000)
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
