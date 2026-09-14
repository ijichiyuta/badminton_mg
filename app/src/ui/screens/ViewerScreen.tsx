// 速報の閲覧ページ。docs/15-ui-ux.md 第2部11
//
// **主役は結果一覧ではなく「自分の次の試合はいつ・どこか」。**
// 第1号提供先の要項には「当日のプログラム配布はありません」と明記されており、
// 選手が自分の端末で見る前提がすでにある。
// ここで「次いつ？」「何番コート？」に先回りして答えれば、運営者への質問が減る（O-5-1）。
//
// 読むだけ。書き込みはできない。

import { useEffect, useMemo, useState } from 'react'
import { fetchPublished, fetchPublishedAt } from '../../store/publish'
import type { TournamentSnapshot } from '../../store/schema'
import { circled } from '../useApp'

interface Props {
  tournamentId: string
}

export function ViewerScreen({ tournamentId }: Props) {
  const [snap, setSnap] = useState<TournamentSnapshot | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'offline'>('loading')
  const [query, setQuery] = useState('')

  const load = async () => {
    try {
      const [s, at] = await Promise.all([
        fetchPublished(tournamentId),
        fetchPublishedAt(tournamentId),
      ])
      if (s === null) {
        setState('notfound')
        return
      }
      setSnap(s)
      setUpdatedAt(at)
      setState('ready')
    } catch {
      setState('offline')
    }
  }

  useEffect(() => {
    void load()
    // 進行中は動くので、定期的に取り直す。
    const id = setInterval(() => void load(), 60_000)
    return () => clearInterval(id)
  }, [tournamentId])

  const idx = useMemo(() => {
    if (!snap) return null
    const playerById = new Map(snap.players.map((p) => [p.id, p]))
    const entryById = new Map(snap.entries.map((e) => [e.id, e]))
    const groupById = new Map(snap.groups.map((g) => [g.id, g]))
    const eventById = new Map(snap.events.map((e) => [e.id, e]))
    const label = (id: string | null) => {
      if (!id) return '—'
      const e = entryById.get(id)
      if (!e) return '—'
      if (e.teamName) return e.teamName
      const ns = e.playerIds.map((p) => playerById.get(p)?.name ?? '').filter(Boolean)
      return ns.length > 0 ? ns.join(' / ') : (e.affiliation ?? '—')
    }
    const block = (id: string | null) => {
      if (!id) return ''
      const g = groupById.get(id)
      if (!g) return ''
      return `${eventById.get(g.eventId)?.name ?? ''} ${g.name}`.trim()
    }
    return { playerById, entryById, label, block, aff: (id: string | null) => (id ? (entryById.get(id)?.affiliation ?? '') : '') }
  }, [snap])

  // 検索。選手名・所属のどちらでも引ける。
  const hits = useMemo(() => {
    if (!snap || !idx || query.trim() === '') return []
    const q = query.trim()
    return snap.entries.filter((e) => {
      const names = e.playerIds.map((p) => idx.playerById.get(p)?.name ?? '').join(' ')
      return names.includes(q) || (e.affiliation ?? '').includes(q) || (e.teamName ?? '').includes(q)
    })
  }, [snap, idx, query])

  if (state === 'loading') return <Shell><p className="text-ink-2">読み込んでいます…</p></Shell>

  if (state === 'offline')
    return (
      <Shell>
        <div className="border-l-4 border-warn bg-warn-soft px-3 py-2">
          <div className="font-bold text-warn">つながりません</div>
          <p className="mt-1 text-sm text-ink-2">電波の届く場所で開き直してください。</p>
        </div>
      </Shell>
    )

  if (state === 'notfound' || !snap || !idx)
    return (
      <Shell>
        <div className="border-l-4 border-ink-3 bg-rule-2 px-3 py-2">
          <div className="font-bold">まだ公開されていません</div>
          <p className="mt-1 text-sm text-ink-2">
            大会が始まると結果が出ます。しばらくしてから開き直してください。
          </p>
        </div>
      </Shell>
    )

  return (
    <Shell>
      <header className="mb-3 border-b border-rule pb-2">
        <h1 className="text-base font-bold leading-tight">{snap.tournament.name}</h1>
        <div className="text-xs text-ink-2 tabular">
          {snap.tournament.date} · {snap.tournament.venue}
          {updatedAt && ` · ${updatedAt.slice(11, 16)} 現在`}
        </div>
      </header>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-bold">選手名で探す</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="山田 / ○○クラブ"
          className="w-full rounded border border-rule px-3 text-base"
          style={{ minHeight: 48 }}
        />
      </div>

      {query.trim() !== '' && hits.length === 0 && (
        <p className="text-sm text-ink-2">見つかりませんでした。姓だけで試してみてください。</p>
      )}

      {hits.map((e) => {
        const mine = snap.matches.filter((m) => m.entryIds.includes(e.id))
        const next = mine.find((m) => m.status !== 'COMPLETED')
        const done = mine.filter((m) => m.status === 'COMPLETED')
        return (
          <section key={e.id} className="mb-4 border-b border-rule-2 pb-4 last:border-b-0">
            <div className="mb-2">
              <div className="text-base font-bold leading-tight">{idx.label(e.id)}</div>
              <div className="text-xs text-ink-2">{idx.aff(e.id)}</div>
            </div>

            {next ? (
              <div className="mb-2 rounded border border-primary bg-primary-soft px-3 py-2">
                <div className="text-xs text-ink-2">次の試合</div>
                <div className="text-lg font-bold tabular">
                  第{next.number}試合 · {next.courtId?.replace('c', '')}番コート
                </div>
                <div className="text-sm">
                  だいたい <span className="font-bold tabular">{next.scheduledAt}</span> ごろ
                </div>
                <div className="mt-1 text-sm text-ink-2">
                  対戦 {idx.label(next.entryIds.find((x) => x !== e.id) ?? null)}
                </div>
                <div className="mt-1 text-xs text-ink-3">{idx.block(next.groupId)}</div>
              </div>
            ) : (
              <div className="mb-2 rounded border border-ok bg-ok-soft px-3 py-2 text-sm">
                <span className="font-bold text-ok">全試合が終わりました</span>
              </div>
            )}

            {done.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-ink-2">これまで</div>
                {done.map((m) => {
                  const won = m.winnerEntryId === e.id
                  const mineSide = m.entryIds[0] === e.id ? 0 : 1
                  const score = m.games
                    .map((g) => (mineSide === 0 ? `${g.scoreA}-${g.scoreB}` : `${g.scoreB}-${g.scoreA}`))
                    .join(' ')
                  return (
                    <div key={m.id} className="flex items-baseline gap-2 py-0.5 text-sm">
                      <span className="w-10 shrink-0 text-xs text-ink-3 tabular">#{m.number}</span>
                      <span className={'shrink-0 font-bold ' + (won ? 'text-ok' : 'text-ink-3')}>
                        {won ? '○' : '●'}
                      </span>
                      <span className="tabular">{score || '—'}</span>
                      <span className="min-w-0 truncate text-xs text-ink-2">
                        {idx.label(m.entryIds.find((x) => x !== e.id) ?? null)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      {query.trim() === '' && (
        <details className="mt-2">
          <summary className="cursor-pointer py-2 text-sm text-primary" style={{ minHeight: 44 }}>
            大会全体の進行を見る
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth: 420 }}>
              <tbody>
                {snap.matches.slice(0, 200).map((m) => (
                  <tr key={m.id} className="border-b border-rule-2">
                    <td className="py-1 pr-2 text-ink-3 tabular">#{m.number}</td>
                    <td className="py-1 pr-2 text-ink-2 tabular">{m.scheduledAt}</td>
                    <td className="py-1 pr-2 text-ink-2">{m.courtId?.replace('c', '')}番</td>
                    <td className="min-w-0 py-1 pr-2">
                      <div className="truncate">
                        {idx.label(m.entryIds[0])} vs {idx.label(m.entryIds[1])}
                      </div>
                      <div className="truncate text-ink-3">
                        {idx.block(m.groupId)} {circled(m.numberInGroup)}
                      </div>
                    </td>
                    <td className="py-1 text-right">
                      {m.status === 'COMPLETED' ? (
                        <span className="text-ok">済</span>
                      ) : (
                        <span className="text-ink-3">待ち</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <footer className="mt-6 border-t border-rule pt-2 text-xs text-ink-3">
        表示は{updatedAt ? ` ${updatedAt.slice(11, 16)} ` : ''}時点のものです。
        試合時間・コートは変更することがあります。
      </footer>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto h-full max-w-xl overflow-y-auto bg-paper px-4 py-4">{children}</div>
  )
}
