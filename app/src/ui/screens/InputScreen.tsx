// 結果入力画面。docs/15-ui-ux.md 第2部5
//
// 1人運用における最重要画面。入力速度が製品の価値を決める。
// 紙のスコアシートの通りに数字を順に打つ。タブ移動もタップも挟まない。

import { useReducer, useState } from 'react'
import {
  displayValue,
  initScoreInput,
  isGameDisabled,
  scoreInputReducer,
  summarize,
  type Side,
} from '../scoreInput'
import { describeRule } from '../../domain/scoring'
import type { MatchRecord, ScoringRuleRecord } from '../../store/schema'
import type { Game } from '../../domain/types'
import type { Indexes } from '../useApp'

/** 通常以外の結果種別の言い方。色だけで状態を伝えないため、文字でも出す。 */
const RESULT_LABEL: Record<string, string> = {
  BYE: '不戦勝（対戦相手なし）',
  WALKOVER: '不戦勝（相手が棄権）',
  RETIRED: '途中棄権',
  WITHDRAWN: '欠場',
  DISQUALIFIED: '失格',
  DOUBLE_WALKOVER: '両者棄権（双方の負け）',
  NOT_PLAYED: '試合なし',
}

interface Props {
  match: MatchRecord
  rule: ScoringRuleRecord
  idx: Indexes
  onSubmit: (games: Game[]) => void
  onRetire: (side: 'A' | 'B' | 'BOTH') => void
  onClear: () => void
  onPickNumber: (n: number) => void
  matchCount: number
}

/**
 * **呼び出し側で `key={match.id}` を付けること。**
 * 試合が変わったら作り直す。中途半端に state をリセットするより確実で、
 * 入力途中の値が別の試合に混ざる事故が起きない。
 */
export function InputScreen({
  match,
  rule,
  idx,
  onSubmit,
  onRetire,
  onClear,
  onPickNumber,
  matchCount,
}: Props) {
  const [view, dispatch] = useReducer(
    scoreInputReducer,
    undefined,
    () => initScoreInput(rule, match.games),
  )
  const [numberDraft, setNumberDraft] = useState('')
  const [retireOpen, setRetireOpen] = useState(false)

  const sum = summarize(view)
  const nameA = idx.entryLabel(match.entryIds[0])
  const nameB = idx.entryLabel(match.entryIds[1])

  const key = (label: string, onPress: () => void, kind: 'num' | 'act' = 'num') => (
    <button
      key={label}
      onClick={onPress}
      className={
        'h-14 rounded-md border text-2xl font-semibold tabular active:bg-primary-soft ' +
        (kind === 'act'
          ? 'border-rule bg-rule-2 text-ink-2 text-lg'
          : 'border-rule bg-paper text-ink')
      }
      style={{ minHeight: 56, minWidth: 44 }}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      {/* ヘッダ。試合番号の直接入力を常時置く（紙からの転記） */}
      <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
        <span className="shrink-0 whitespace-nowrap text-xs text-ink-3">試合番号</span>
        <input
          inputMode="numeric"
          value={numberDraft}
          onChange={(e) => setNumberDraft(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && numberDraft) {
              onPickNumber(Number(numberDraft))
              setNumberDraft('')
            }
          }}
          placeholder={`1〜${matchCount}`}
          className="w-20 rounded border border-rule px-2 py-1 text-center tabular"
          style={{ minHeight: 44 }}
        />
        <button
          onClick={() => {
            if (numberDraft) {
              onPickNumber(Number(numberDraft))
              setNumberDraft('')
            }
          }}
          className="shrink-0 whitespace-nowrap rounded border border-rule px-3 text-sm"
          style={{ minHeight: 44 }}
        >
          開く
        </button>
        <span className="ml-auto min-w-0 truncate text-xs text-ink-3">
          {describeRule(rule).replace('この種目は ', '').replace(' の設定です', '').replace('の設定です', '')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="rounded bg-ink px-2 py-0.5 text-sm font-bold text-paper tabular">
            第{match.number}試合
          </span>
          <span className="text-sm text-ink-2">{idx.blockLabel(match.groupId)}</span>
          <span className="ml-auto text-sm text-ink-2 tabular">
            {match.scheduledAt} / {match.courtId?.replace('c', '')}番コート
          </span>
        </div>

        {/* 対戦者 */}
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="text-right">
            <div className="font-semibold leading-tight">{nameA}</div>
            <div className="text-xs text-ink-2">{idx.entryAffiliation(match.entryIds[0])}</div>
          </div>
          <div className="text-xs text-ink-3">vs</div>
          <div>
            <div className="font-semibold leading-tight">{nameB}</div>
            <div className="text-xs text-ink-2">{idx.entryAffiliation(match.entryIds[1])}</div>
          </div>
        </div>

        {/* スコアのマス。6個の数字を順に打つ */}
        <div className="flex flex-col gap-2">
          {view.cells.map((pair, g) => {
            const disabled = isGameDisabled(view, g)
            return (
              <div
                key={g}
                className={'grid grid-cols-[2.5rem_1fr_auto_1fr] items-center gap-2 ' + (disabled ? 'opacity-35' : '')}
              >
                <span className="text-xs text-ink-3">{g + 1}G</span>
                {(['A', 'B'] as Side[]).map((side, i) => (
                  <ScoreCell
                    key={side}
                    cell={pair[i]}
                    focused={view.focus?.game === g && view.focus?.side === side}
                    disabled={disabled}
                    onClick={() => dispatch({ type: 'FOCUS', game: g, side })}
                    separator={i === 0 ? '−' : null}
                  />
                ))}
              </div>
            )
          })}
        </div>

        {/* 警告。設定値を必ず添える。ブロックはしない */}
        {sum.issues.length > 0 && (
          <div className="mt-3 border-l-4 border-warn bg-warn-soft px-3 py-2 text-sm">
            <div className="mb-1 font-semibold text-warn">⚠ 確認してください</div>
            {sum.issues.map((it, i) => (
              <div key={i} className="text-ink-2">
                {it.message}
              </div>
            ))}
            <div className="mt-1 text-xs text-ink-3">このまま確定することもできます</div>
          </div>
        )}

        {sum.decided && (
          <div className="mt-3 border-l-4 border-ok bg-ok-soft px-3 py-2 text-sm">
            <span className="font-semibold text-ok">勝ち</span>{' '}
            {sum.winner === 'A' ? nameA : nameB}
          </div>
        )}

        {/*
          棄権。実データでは1割前後で起きるので、隠さず同じ画面に置く。
          ただし平時は1行に畳んでおく（docs/15-ui-ux.md の段階的開示）。

          **「不戦勝」と「途中棄権」を運営者に選ばせない。**
          スコアが入っていなければ不戦勝、入っていれば途中棄権と決まる。
        */}
        {match.status !== 'COMPLETED' && (
          <div className="mt-3">
            {!retireOpen ? (
              <button
                onClick={() => setRetireOpen(true)}
                className="w-full rounded border border-rule py-2 text-sm text-ink-2"
                style={{ minHeight: 44 }}
              >
                棄権・不戦勝を記録する
              </button>
            ) : (
              <div className="rounded border border-rule p-2">
                <div className="px-1 pb-2 text-xs text-ink-3">
                  {sum.games.length > 0
                    ? 'ここまでのスコアを残して「途中棄権」として記録します'
                    : 'スコアなしの「不戦勝」として記録します'}
                </div>
                <div className="grid gap-2">
                  <button
                    onClick={() => onRetire('A')}
                    className="w-full rounded border border-rule px-3 py-2 text-left text-sm"
                    style={{ minHeight: 44 }}
                  >
                    <b>{nameA}</b> が棄権 <span className="text-ink-3">→ {nameB} の勝ち</span>
                  </button>
                  <button
                    onClick={() => onRetire('B')}
                    className="w-full rounded border border-rule px-3 py-2 text-left text-sm"
                    style={{ minHeight: 44 }}
                  >
                    <b>{nameB}</b> が棄権 <span className="text-ink-3">→ {nameA} の勝ち</span>
                  </button>
                  <button
                    onClick={() => onRetire('BOTH')}
                    className="w-full rounded border border-rule px-3 py-2 text-left text-sm text-ink-2"
                    style={{ minHeight: 44 }}
                  >
                    両者とも棄権 <span className="text-ink-3">→ 双方の負け</span>
                  </button>
                  <button
                    onClick={() => setRetireOpen(false)}
                    className="w-full py-2 text-sm text-ink-3"
                    style={{ minHeight: 44 }}
                  >
                    やめる
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {match.status === 'COMPLETED' && (
          <div className="mt-3">
            {match.resultType !== 'NORMAL' && (
              <div className="mb-2 border-l-4 border-warn bg-warn-soft px-3 py-2 text-sm">
                {RESULT_LABEL[match.resultType]}として記録されています
              </div>
            )}
            <button
              onClick={onClear}
              className="w-full rounded border border-rule py-2 text-sm text-ink-2"
              style={{ minHeight: 44 }}
            >
              この試合の結果を取り消す
            </button>
          </div>
        )}
      </div>

      {/*
        テンキー。画面下部に固定。片手で届く。
        棄権パネルを開いている間は出さない。数字を打つ場面ではないうえ、
        固定表示のままだと選択肢が隠れてしまう。
      */}
      {!retireOpen && (
      <div className="border-t border-rule bg-rule-2/40 p-2 no-print">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3].map((n) => key(String(n), () => dispatch({ type: 'DIGIT', digit: n })))}
          {key('⌫', () => dispatch({ type: 'BACKSPACE' }), 'act')}
          {[4, 5, 6].map((n) => key(String(n), () => dispatch({ type: 'DIGIT', digit: n })))}
          {key('次へ', () => dispatch({ type: 'NEXT' }), 'act')}
          {[7, 8, 9].map((n) => key(String(n), () => dispatch({ type: 'DIGIT', digit: n })))}
          {key('消去', () => dispatch({ type: 'CLEAR' }), 'act')}
          {key('0', () => dispatch({ type: 'DIGIT', digit: 0 }))}
          <button
            onClick={() => sum.canSubmit && onSubmit(sum.games)}
            disabled={!sum.canSubmit}
            className={
              'col-span-3 h-14 rounded-md text-lg font-bold ' +
              (sum.canSubmit ? 'bg-primary text-paper' : 'bg-rule text-ink-3')
            }
            style={{ minHeight: 56 }}
          >
            確定して次の試合へ
          </button>
        </div>
      </div>
      )}
    </div>
  )
}

function ScoreCell({
  cell,
  focused,
  disabled,
  onClick,
  separator,
}: {
  cell: { value: number | null; auto: boolean; draft: string }
  focused: boolean
  disabled: boolean
  onClick: () => void
  separator: string | null
}) {
  const text = displayValue(cell)
  return (
    <>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={cell.auto ? `${text}（自動入力）` : text || '未入力'}
        className={
          'flex items-center justify-center rounded border text-3xl font-bold tabular ' +
          (focused ? 'border-2 border-primary text-primary ' : 'border-rule ') +
          (cell.auto ? 'border-dashed text-ink-3 ' : '')
        }
        style={{ minHeight: 56 }}
      >
        {text || <span className="text-ink-3 text-xl">–</span>}
      </button>
      {separator && <span className="text-ink-3">{separator}</span>}
    </>
  )
}
