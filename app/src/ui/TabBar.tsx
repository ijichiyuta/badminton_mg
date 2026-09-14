// 画面下のタブバー。
//
// 文字だけだと、どれがどれか一瞬で分からない。**アイコンと文字を両方出す。**
// スマホのアプリで見慣れた形に寄せるほうが、説明なしで押してもらえる。
//
// 色だけで選択中を示さない（docs/15-ui-ux.md）。
// 選んでいるタブはアイコンの後ろに下地を敷き、文字も太くする。

export interface TabItem<T extends string> {
  id: T
  label: string
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** 24×24 のアイコン。線は currentColor なので、文字色と一緒に変わる。 */
const ICONS: Record<string, React.ReactNode> = {
  // 家
  home: (
    <>
      <path {...STROKE} d="M3.5 10.2 12 3.6l8.5 6.6" />
      <path {...STROKE} d="M5.5 9.2V20h13V9.2" />
      <path {...STROKE} d="M9.8 20v-5.2h4.4V20" />
    </>
  ),
  // テンキー
  input: (
    <>
      <rect {...STROKE} x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" />
      <circle cx="12" cy="8.5" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" />
      <circle cx="8.5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" />
      <circle cx="12" cy="15.5" r="1.1" fill="currentColor" />
    </>
  ),
  // 星取表（対角線のある表）
  standings: (
    <>
      <rect {...STROKE} x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path {...STROKE} d="M3.5 9h17M3.5 14.5h17M9 3.5v17M14.5 3.5v17" />
    </>
  ),
  // 時計
  timetable: (
    <>
      <circle {...STROKE} cx="12" cy="12" r="8.5" />
      <path {...STROKE} d="M12 7.2V12l3.2 2.2" />
    </>
  ),
  // プリンタ
  print: (
    <>
      <path {...STROKE} d="M7 8.5V3.8h10v4.7" />
      <path {...STROKE} d="M7 17H5.2A1.7 1.7 0 0 1 3.5 15.3v-5.1A1.7 1.7 0 0 1 5.2 8.5h13.6a1.7 1.7 0 0 1 1.7 1.7v5.1A1.7 1.7 0 0 1 18.8 17H17" />
      <rect {...STROKE} x="7" y="13.5" width="10" height="6.7" rx="1" />
    </>
  ),
  // 歯車
  setup: (
    <>
      <circle {...STROKE} cx="12" cy="12" r="3.1" />
      <path
        {...STROKE}
        d="M19.3 14.2a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.2a1.8 1.8 0 1 1-3.7 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.2a1.8 1.8 0 1 1 0-3.7h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 1 1 3.7 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 1 1 0 3.7h-.1a1.5 1.5 0 0 0-1.4.9"
      />
    </>
  ),
}

export function TabBar<T extends string>({
  tabs,
  current,
  onChange,
}: {
  tabs: TabItem<T>[]
  current: T
  onChange: (id: T) => void
}) {
  return (
    <nav
      className="border-t border-rule bg-paper no-print"
      // iPhone の下端の帯にタブが隠れないようにする。
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="画面の切り替え"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((x) => {
          const on = x.id === current
          return (
            <button
              key={x.id}
              onClick={() => onChange(x.id)}
              aria-current={on ? 'page' : undefined}
              className={
                'flex flex-col items-center justify-center gap-0.5 py-1.5 ' +
                (on ? 'text-primary' : 'text-ink-2')
              }
              style={{ minHeight: 58 }}
            >
              {/* 選択中は下地を敷く。色だけに頼らない */}
              <span
                className={
                  'flex items-center justify-center rounded-full transition-colors ' +
                  (on ? 'bg-primary-soft' : '')
                }
                style={{ width: 46, height: 26 }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  {ICONS[x.id]}
                </svg>
              </span>
              <span className={'leading-none ' + (on ? 'font-bold' : '')} style={{ fontSize: 11.5 }}>
                {x.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
