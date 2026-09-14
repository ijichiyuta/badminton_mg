// トーナメント表。docs/15-ui-ux.md
//
// 紙のトーナメント表は「線で結んだ左右対称の樹形図」だが、スマホの縦画面では読めない。
// **ラウンドごとに縦に並べる。**どこまで進んだかと、次に呼ぶ試合が分かればいい。
// 樹形図が要るのは掲示用で、それは印刷で出す。

import { roundLabel } from '../../domain/draw'
import type { MatchRecord } from '../../store/schema'
import type { Indexes } from '../useApp'

interface Props {
  matches: MatchRecord[]
  idx: Indexes
  onOpenMatch: (m: MatchRecord) => void
}

export function BracketView({ matches, idx, onOpenMatch }: Props) {
  if (matches.length === 0) {
    return <div className="p-4 text-ink-2">まだ組合せができていません</div>
  }

  const rounds = Math.max(...matches.map((m) => m.round))
  // 団体戦では1対戦が複数の試合に分かれる。表には対戦を1行で出す。
  const ties = groupIntoTies(matches)
  const remaining = ties.filter((t) => !t.done && !t.bye).length
  const champion = ties.find((t) => t.round === rounds && t.done)?.winnerId ?? null

  return (
    <div className="p-3">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-base font-bold">トーナメント</h2>
        <span className="text-xs text-ink-2">
          {ties.filter((t) => !t.bye).length}試合 ・ 残り{remaining}
        </span>
      </div>

      {champion && (
        <div className="mb-3 border-l-4 border-ok bg-ok-soft px-3 py-2">
          <div className="text-xs text-ink-2">優勝</div>
          <div className="text-base font-bold">{idx.entryLabel(champion)}</div>
        </div>
      )}

      {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
        const inRound = ties.filter((t) => t.round === r)
        const played = inRound.filter((t) => !t.bye)
        if (played.length === 0) {
          // 全部 BYE のラウンドは、行を作らず件数だけ伝える。
          return (
            <div key={r} className="mb-3 text-xs text-ink-3">
              {roundLabel(r, rounds)}は全員が不戦勝で通過（{inRound.length}枠）
            </div>
          )
        }
        return (
          <section key={r} className="mb-4">
            <div className="mb-1 flex items-baseline gap-2">
              <h3 className="text-sm font-bold">{roundLabel(r, rounds)}</h3>
              <span className="text-xs text-ink-3">
                {played.filter((t) => t.done).length}／{played.length}
              </span>
            </div>
            <div className="overflow-hidden rounded border border-rule">
              {played.map((t) => (
                <button
                  key={t.key}
                  onClick={() => onOpenMatch(t.open)}
                  disabled={!t.ready}
                  className={
                    'flex w-full items-center gap-2 border-b border-rule-2 px-3 py-2 text-left last:border-b-0 ' +
                    (t.ready ? 'active:bg-primary-soft' : '')
                  }
                  style={{ minHeight: 52 }}
                >
                  <span className="w-8 shrink-0 text-xs text-ink-3 tabular">{t.open.number}</span>
                  <span className="min-w-0 flex-1">
                    <Side
                      id={t.entryIds[0]}
                      won={t.done && t.winnerId === t.entryIds[0]}
                      idx={idx}
                    />
                    <Side
                      id={t.entryIds[1]}
                      won={t.done && t.winnerId === t.entryIds[1]}
                      idx={idx}
                    />
                  </span>
                  <span className="shrink-0 text-right text-xs tabular">
                    {t.done ? (
                      <span className="font-bold text-ok">{t.score}</span>
                    ) : t.ready ? (
                      <span className="text-primary">入力</span>
                    ) : (
                      <span className="text-ink-3">相手待ち</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Side({ id, won, idx }: { id: string | null; won: boolean; idx: Indexes }) {
  if (id === null) {
    return <div className="truncate text-sm text-ink-3">（勝者待ち）</div>
  }
  return (
    <div className={'truncate text-sm ' + (won ? 'font-bold' : 'text-ink-2')}>
      {won && <span className="mr-1 text-ok">○</span>}
      {idx.entryLabel(id)}
      <span className="ml-1 text-xs text-ink-3">{idx.entryAffiliation(id)}</span>
    </div>
  )
}

interface Tie {
  key: string
  round: number
  entryIds: (string | null)[]
  /** 実施せずに通過する枠。 */
  bye: boolean
  done: boolean
  /** 両者が決まっていて入力できる状態か。 */
  ready: boolean
  winnerId: string | null
  score: string
  /** タップしたときに開く試合。未入力があればそこ。 */
  open: MatchRecord
}

/** 団体戦の3試合を1対戦にまとめる。個人戦は1試合＝1対戦。 */
function groupIntoTies(matches: MatchRecord[]): Tie[] {
  const buckets = new Map<string, MatchRecord[]>()
  for (const m of matches) {
    const key = m.tieId ?? m.id
    const arr = buckets.get(key)
    if (arr) arr.push(m)
    else buckets.set(key, [m])
  }

  const out: Tie[] = []
  for (const [key, ms] of buckets) {
    const head = ms[0]
    const [a, b] = head.entryIds
    const wa = ms.filter((m) => m.winnerEntryId === a).length
    const wb = ms.filter((m) => m.winnerEntryId === b).length
    const need = Math.floor(ms.length / 2) + 1
    const decided = wa >= need || wb >= need
    const allDone = ms.every((m) => m.status === 'COMPLETED')
    const bye = head.resultType === 'BYE'
    // **両者が決まっていない試合は「終わった」ではない。**
    // BYE で片側だけ埋まった状態を完了として扱うと、決勝に○が付いてしまう。
    const ready = a !== null && b !== null
    out.push({
      key,
      round: head.round,
      entryIds: head.entryIds,
      bye,
      done: bye || (ready && (decided || allDone)),
      ready,
      winnerId: wa > wb ? a : wb > wa ? b : (head.winnerEntryId ?? null),
      score: ms.length > 1 ? `${wa}－${wb}` : wa > wb ? '○' : '●',
      open: ms.find((m) => m.status !== 'COMPLETED') ?? head,
    })
  }
  return out.sort((x, y) => x.round - y.round || (x.open.number ?? 0) - (y.open.number ?? 0))
}
