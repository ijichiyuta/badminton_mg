// 大会作成 → 種目 → 参加者 → 組合せ の導線。docs/15-ui-ux.md 第2部1〜3
//
// 設定を減らす4つの仕掛けのうち、ここでは次を効かせる。
//   ・段階的開示（既定のまま進める。触った人だけ詳細へ）
//   ・貼り付け取り込み（ファイル選択ダイアログを経由させない）
//   ・人数から形式を提案する（白紙から組ませない）
//   ・抽選のやり直しを無制限に許す

import { useMemo, useState } from 'react'
import { SCORING_PRESETS, RANKING_PRESETS, DEFAULT_SCORING_PRESET_ID, DEFAULT_RANKING_PRESET_ID } from '../../domain/presets'
import { parseRoster, type ParsedRow } from '../roster'
import type { EventRecord, GroupRecord, StageRecord, TournamentRecord } from '../../store/schema'
import type { Indexes } from '../useApp'

export interface SetupActions {
  createTournament: (input: {
    name: string
    date: string
    venue: string
    courtCount: number
    scoringPresetId: string
    rankingPresetId: string
  }) => Promise<TournamentRecord>
  addEventWithStage: (
    tournamentId: string,
    name: string,
    female: boolean,
  ) => Promise<{ event: EventRecord; stage: StageRecord }>
  importRoster: (eventId: string, rows: ParsedRow[]) => Promise<void>
  buildGroups: (stageId: string, opts: { perGroup: number; drawSeed: number }) => Promise<GroupRecord[]>
  buildSchedule: (opts: { courtCount: number; startTime: string; slotMinutes: number }) => Promise<void>
}

type Step = 'tournament' | 'events' | 'roster' | 'draw' | 'done'

interface Props {
  tournament: TournamentRecord | null
  events: EventRecord[]
  groups: GroupRecord[]
  idx: Indexes | null
  actions: SetupActions
  onFinish: () => void
}

export function SetupScreen({ tournament, events, groups, idx, actions, onFinish }: Props) {
  const [step, setStep] = useState<Step>(tournament ? 'events' : 'tournament')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <StepBar step={step} />
      {note && (
        <div className="mb-3 border-l-4 border-warn bg-warn-soft px-3 py-2 text-sm text-ink-2">{note}</div>
      )}

      {step === 'tournament' && (
        <TournamentStep
          busy={busy}
          onNext={async (v) => {
            setBusy(true)
            try {
              await actions.createTournament(v)
              setStep('events')
            } catch (e) {
              setNote(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {step === 'events' && tournament && (
        <EventsStep
          tournament={tournament}
          events={events}
          busy={busy}
          onAdd={async (name, female) => {
            setBusy(true)
            try {
              await actions.addEventWithStage(tournament.id, name, female)
            } finally {
              setBusy(false)
            }
          }}
          onNext={() => setStep('roster')}
        />
      )}

      {step === 'roster' && tournament && (
        <RosterStep
          events={events}
          busy={busy}
          idx={idx}
          onImport={async (eventId, rows) => {
            setBusy(true)
            try {
              await actions.importRoster(eventId, rows)
            } finally {
              setBusy(false)
            }
          }}
          onNext={() => setStep('draw')}
        />
      )}

      {step === 'draw' && tournament && (
        <DrawStep
          tournament={tournament}
          events={events}
          groups={groups}
          idx={idx}
          busy={busy}
          onDraw={async (stageId, perGroup, seed) => {
            setBusy(true)
            try {
              await actions.buildGroups(stageId, { perGroup, drawSeed: seed })
            } finally {
              setBusy(false)
            }
          }}
          onConfirm={async (opts) => {
            setBusy(true)
            try {
              await actions.buildSchedule(opts)
              setStep('done')
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {step === 'done' && (
        <div className="rounded border border-ok bg-ok-soft px-3 py-6 text-center">
          <div className="text-lg font-bold text-ok">組合せを確定しました</div>
          <div className="mt-1 text-sm text-ink-2">試合番号が振られ、タイムテーブルができています</div>
          <button
            onClick={onFinish}
            className="mt-3 rounded bg-primary px-5 font-bold text-paper"
            style={{ minHeight: 44 }}
          >
            ホームへ
          </button>
        </div>
      )}
    </div>
  )
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'tournament', label: '大会' },
  { id: 'events', label: '種目' },
  { id: 'roster', label: '参加者' },
  { id: 'draw', label: '組合せ' },
]

function StepBar({ step }: { step: Step }) {
  const i = STEPS.findIndex((s) => s.id === step)
  return (
    <div className="mb-3 flex items-center gap-1 text-xs">
      {STEPS.map((s, k) => (
        <span key={s.id} className="flex items-center gap-1">
          <span
            className={
              'rounded px-2 py-0.5 ' +
              (k === i
                ? 'bg-primary font-bold text-paper'
                : k < i || step === 'done'
                  ? 'bg-ok-soft text-ok'
                  : 'bg-rule-2 text-ink-3')
            }
          >
            {k < i || step === 'done' ? '✓ ' : ''}
            {s.label}
          </span>
          {k < STEPS.length - 1 && <span className="text-ink-3">›</span>}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function TournamentStep({
  busy,
  onNext,
}: {
  busy: boolean
  onNext: (v: {
    name: string
    date: string
    venue: string
    courtCount: number
    scoringPresetId: string
    rankingPresetId: string
  }) => void
}) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [venue, setVenue] = useState('')
  const [courtCount, setCourtCount] = useState(6)
  const [scoring, setScoring] = useState(DEFAULT_SCORING_PRESET_ID)
  const [ranking, setRanking] = useState(DEFAULT_RANKING_PRESET_ID)
  const [advanced, setAdvanced] = useState(false)

  const common = SCORING_PRESETS.filter((p) => p.common)
  const rest = SCORING_PRESETS.filter((p) => !p.common)
  const chosen = SCORING_PRESETS.find((p) => p.presetId === scoring)
  const chosenRanking = RANKING_PRESETS.find((p) => p.presetId === ranking)

  return (
    <section>
      <h2 className="mb-2 text-base font-bold">大会の名前と日付は？</h2>
      <Field label="大会名">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="第64回○○バドミントン大会"
          className="w-full rounded border border-rule px-3"
          style={{ minHeight: 44 }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="日付">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-rule px-3 tabular"
            style={{ minHeight: 44 }}
          />
        </Field>
        <Field label="コート数">
          <input
            type="number"
            min={1}
            max={20}
            value={courtCount}
            onChange={(e) => setCourtCount(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded border border-rule px-3 tabular"
            style={{ minHeight: 44 }}
          />
        </Field>
      </div>
      <Field label="会場">
        <input
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="○○スポーツセンター"
          className="w-full rounded border border-rule px-3"
          style={{ minHeight: 44 }}
        />
      </Field>

      {/* 既定値を表示だけして、触らなくても進める（段階的開示） */}
      <div className="mt-3 rounded border border-rule p-2 text-sm">
        <Row label="採点方式" value={chosen?.label ?? ''} note={chosen?.note ?? ''} />
        <Row label="順位決定" value={chosenRanking?.label ?? ''} note={chosenRanking?.wording ?? ''} />
        <button
          onClick={() => setAdvanced(!advanced)}
          className="mt-1 text-sm text-primary"
          style={{ minHeight: 44 }}
        >
          {advanced ? '▾ 閉じる' : '▸ 変更する'}
        </button>

        {advanced && (
          <div className="mt-2 border-t border-rule-2 pt-2">
            <div className="mb-1 text-xs font-bold text-ink-2">採点方式</div>
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              {common.map((p) => (
                <Chip key={p.presetId} on={scoring === p.presetId} onClick={() => setScoring(p.presetId)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-ink-2" style={{ minHeight: 44 }}>
                その他の形式（11点以下・時間制・上限なし）
              </summary>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {rest.map((p) => (
                  <Chip key={p.presetId} on={scoring === p.presetId} onClick={() => setScoring(p.presetId)}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </details>

            <div className="mb-1 mt-3 text-xs font-bold text-ink-2">順位決定（要項の文面から選ぶ）</div>
            <div className="flex flex-col gap-1.5">
              {RANKING_PRESETS.map((p) => (
                <button
                  key={p.presetId}
                  onClick={() => setRanking(p.presetId)}
                  className={
                    'rounded border px-3 py-2 text-left text-sm ' +
                    (ranking === p.presetId ? 'border-primary bg-primary-soft' : 'border-rule')
                  }
                  style={{ minHeight: 44 }}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-ink-2">「{p.wording}」</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        disabled={busy || name.trim() === ''}
        onClick={() =>
          onNext({ name: name.trim(), date, venue: venue.trim(), courtCount, scoringPresetId: scoring, rankingPresetId: ranking })
        }
        className={
          'mt-4 w-full rounded py-3 font-bold ' +
          (name.trim() === '' ? 'bg-rule text-ink-3' : 'bg-primary text-paper')
        }
        style={{ minHeight: 52 }}
      >
        次へ
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------

const EVENT_PRESETS = [
  { name: '男子ダブルス', female: false },
  { name: '女子ダブルス', female: true },
  { name: '男子シングルス', female: false },
  { name: '女子シングルス', female: true },
  { name: '混合ダブルス', female: false },
]

function EventsStep({
  tournament,
  events,
  busy,
  onAdd,
  onNext,
}: {
  tournament: TournamentRecord
  events: EventRecord[]
  busy: boolean
  onAdd: (name: string, female: boolean) => void
  onNext: () => void
}) {
  const [custom, setCustom] = useState('')

  return (
    <section>
      <h2 className="mb-1 text-base font-bold">どの種目をやりますか？</h2>
      <p className="mb-2 text-xs text-ink-2">{tournament.name}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {EVENT_PRESETS.map((p) => (
          <button
            key={p.name}
            disabled={busy}
            onClick={() => onAdd(p.name, p.female)}
            className="rounded border border-rule px-3 text-sm"
            style={{ minHeight: 44 }}
          >
            + {p.name}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="男子ダブルス 1部 など"
          className="min-w-0 flex-1 rounded border border-rule px-3"
          style={{ minHeight: 44 }}
        />
        <button
          disabled={busy || custom.trim() === ''}
          onClick={() => {
            onAdd(custom.trim(), custom.includes('女'))
            setCustom('')
          }}
          className="shrink-0 rounded border border-rule px-4 text-sm"
          style={{ minHeight: 44 }}
        >
          追加
        </button>
      </div>

      {events.length > 0 && (
        <div className="mb-3 rounded border border-rule">
          {events.map((e) => (
            <div key={e.id} className="border-b border-rule-2 px-3 py-2 text-sm last:border-b-0">
              {e.name}
            </div>
          ))}
        </div>
      )}

      <button
        disabled={events.length === 0}
        onClick={onNext}
        className={
          'w-full rounded py-3 font-bold ' +
          (events.length === 0 ? 'bg-rule text-ink-3' : 'bg-primary text-paper')
        }
        style={{ minHeight: 52 }}
      >
        次へ（{events.length}種目）
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------

function RosterStep({
  events,
  busy,
  idx,
  onImport,
  onNext,
}: {
  events: EventRecord[]
  busy: boolean
  idx: Indexes | null
  onImport: (eventId: string, rows: ParsedRow[]) => void
  onNext: () => void
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '')
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseRoster(text), [text])

  return (
    <section>
      <h2 className="mb-1 text-base font-bold">参加者を取り込む</h2>
      <p className="mb-2 text-xs text-ink-2">
        Excel の範囲をコピーして、下の欄に貼り付けてください。1行が1エントリーです。
      </p>

      <Field label="種目">
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="w-full rounded border border-rule px-3"
          style={{ minHeight: 44 }}
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={'○○クラブ\t山田 太郎\t佐藤 次郎\n△△高校\t鈴木 花子\t高橋 桃子'}
        className="w-full rounded border border-rule p-2 font-mono text-sm"
      />

      {parsed.rows.length > 0 && (
        <div className="mt-2 rounded border border-rule">
          <div className="border-b border-rule-2 px-2 py-1 text-xs text-ink-2">
            {parsed.rows.length}件を読み取りました
            {parsed.warnings.length > 0 && ` · ⚠ ${parsed.warnings.length}件の注意`}
          </div>
          <div className="max-h-40 overflow-y-auto">
            {parsed.rows.slice(0, 8).map((r, i) => (
              <div key={i} className="flex gap-2 border-b border-rule-2 px-2 py-1 text-sm last:border-b-0">
                <span className="w-24 shrink-0 truncate text-xs text-ink-2">{r.affiliation || '—'}</span>
                <span className="min-w-0 flex-1 truncate">{r.playerNames.join(' / ')}</span>
              </div>
            ))}
            {parsed.rows.length > 8 && (
              <div className="px-2 py-1 text-xs text-ink-3">… 他 {parsed.rows.length - 8}件</div>
            )}
          </div>
        </div>
      )}

      {parsed.warnings.length > 0 && (
        <div className="mt-2 border-l-4 border-warn bg-warn-soft px-3 py-2 text-sm">
          {parsed.warnings.map((w, i) => (
            <div key={i} className="text-ink-2">
              ⚠ {w}
            </div>
          ))}
          <div className="mt-1 text-xs text-ink-3">このまま取り込むこともできます</div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          disabled={busy || parsed.rows.length === 0 || eventId === ''}
          onClick={() => {
            onImport(eventId, parsed.rows)
            setText('')
          }}
          className={
            'flex-1 rounded py-3 font-bold ' +
            (parsed.rows.length === 0 ? 'bg-rule text-ink-3' : 'bg-primary text-paper')
          }
          style={{ minHeight: 52 }}
        >
          この種目に取り込む
        </button>
        <button onClick={onNext} className="rounded border border-rule px-5" style={{ minHeight: 52 }}>
          次へ
        </button>
      </div>
      {idx && <div className="mt-2 text-xs text-ink-3">取り込み済みの参加者は組合せの画面で確認できます</div>}
    </section>
  )
}

// ---------------------------------------------------------------------------

function DrawStep({
  tournament,
  events,
  groups,
  idx,
  busy,
  onDraw,
  onConfirm,
}: {
  tournament: TournamentRecord
  events: EventRecord[]
  groups: GroupRecord[]
  idx: Indexes | null
  busy: boolean
  onDraw: (stageId: string, perGroup: number, seed: number) => void
  onConfirm: (opts: { courtCount: number; startTime: string; slotMinutes: number }) => void
}) {
  const [perGroup, setPerGroup] = useState(4)
  const [startTime, setStartTime] = useState('9:30')
  const [slotMinutes, setSlotMinutes] = useState(30)

  return (
    <section>
      <h2 className="mb-1 text-base font-bold">組合せを作る</h2>
      <p className="mb-3 text-xs text-ink-2">
        抽選は何度でもやり直せます。確定するまで試合番号は振られません。
      </p>

      <Field label="1ブロックの組数">
        <div className="flex gap-1.5">
          {[3, 4, 5, 6].map((n) => (
            <Chip key={n} on={perGroup === n} onClick={() => setPerGroup(n)}>
              {n}組
            </Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-3">
          端数は大きいブロックに吸収します（62組を4組ずつなら 5組×2 + 4組×13）
        </p>
      </Field>

      {events.map((ev) => {
        const gs = groups.filter((g) => g.eventId === ev.id)
        return (
          <div key={ev.id} className="mb-3 rounded border border-rule p-2">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-medium">{ev.name}</span>
              <span className="text-xs text-ink-3">
                {gs.length > 0 ? `${gs.length}ブロック` : '未抽選'}
              </span>
              <button
                disabled={busy}
                onClick={() => onDraw(`stage:${ev.id}`, perGroup, Math.floor(Math.random() * 1e9))}
                className="ml-auto rounded border border-rule px-3 text-sm"
                style={{ minHeight: 44 }}
              >
                {gs.length > 0 ? '⟳ もう一度抽選' : '抽選する'}
              </button>
            </div>
            {gs.length > 0 && idx && (
              <div className="flex flex-wrap gap-1.5">
                {gs.map((g) => (
                  <div key={g.id} className="rounded border border-rule-2 px-2 py-1 text-xs">
                    <span className="font-bold">{g.name}</span>
                    <span className="ml-1 text-ink-2">{g.entryIds.length}組</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="開始時刻">
          <input
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="9:30"
            className="w-full rounded border border-rule px-3 tabular"
            style={{ minHeight: 44 }}
          />
        </Field>
        <Field label="1枠の長さ（分）">
          <input
            type="number"
            min={5}
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Math.max(5, Number(e.target.value) || 30))}
            className="w-full rounded border border-rule px-3 tabular"
            style={{ minHeight: 44 }}
          />
        </Field>
      </div>

      <button
        disabled={busy || groups.length === 0}
        onClick={() => onConfirm({ courtCount: tournament.courts.length, startTime, slotMinutes })}
        className={
          'w-full rounded py-3 font-bold ' +
          (groups.length === 0 ? 'bg-rule text-ink-3' : 'bg-primary text-paper')
        }
        style={{ minHeight: 52 }}
      >
        🔒 確定して試合番号を振る
      </button>
      <p className="mt-1 text-xs text-ink-3">確定後も抽選をやり直せますが、試合番号は振り直されます</p>
    </section>
  )
}

// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-2 block">
      <span className="mb-0.5 block text-xs text-ink-2">{label}</span>
      {children}
    </label>
  )
}

function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="w-16 shrink-0 text-xs text-ink-2">{label}</span>
      <span className="font-medium">{value}</span>
      <span className="min-w-0 truncate text-xs text-ink-3">{note}</span>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded border px-3 text-sm ' +
        (on ? 'border-primary bg-primary text-paper font-medium' : 'border-rule text-ink-2')
      }
      style={{ minHeight: 44 }}
    >
      {children}
    </button>
  )
}
