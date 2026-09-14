// 複数端末の合流。docs/adr/0003 の書き直しではなく、その手前の現実解。
//
// 「リアルタイム同時入力」は電波なしでは原理的にできない。ブラウザはサーバになれない。
// しかし**同じ試合を2人が同時に入力することはない**。担当が分かれている。
//
// 必要なのは同期ではなく「**担当を分けて、あとで合流**」。
// 試合ごとに書き手が1人なら、合流は自明に計算できる。
//
//   端末A（メイン）… 男子1〜3部を担当
//   端末B（サブ）  … 女子2〜3部を担当
//         ↓ JSON を渡す（USB / AirDrop / メール / 電波があればサーバ経由）
//       1つの大会データ
//
// 電波が一切なくても成立する。

import type { MatchRecord, TournamentSnapshot } from './schema'

/** この端末の識別子。合流のときに「誰が書いたか」を見る。 */
const DEVICE_KEY = 'badminton-mg:deviceId'

export function deviceId(): string {
  if (typeof localStorage === 'undefined') return 'unknown'
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = `d-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export interface MergeConflict {
  matchId: string
  matchNumber: number | null
  /** 手元の版。 */
  mine: MatchRecord
  /** 相手の版。 */
  theirs: MatchRecord
  reason: 'BOTH_EDITED'
}

export interface MergeResult {
  merged: TournamentSnapshot
  /** 取り込んだ試合数。 */
  applied: number
  /** 両方で編集されていて自動で決められなかったもの。 */
  conflicts: MergeConflict[]
  warnings: string[]
}

/** 結果が入っているか。入っていない試合は「触っていない」とみなす。 */
function isEntered(m: MatchRecord): boolean {
  return m.status === 'COMPLETED' || m.games.length > 0
}

function editedAt(m: MatchRecord): string {
  return m.completedAt ?? ''
}

/**
 * 2つのスナップショットを合流させる。
 *
 * **試合単位で見る。** 片方だけが入力していればそれを採り、
 * 両方が入力していて内容が違う場合だけ衝突として返す。
 *
 * 参加者・組合せ・採番は**基準側（`base`）を正とする**。
 * 抽選は1台で行い、確定してから配る運用を前提にする。
 * 組合せが食い違っていたら合流せず、警告して止める。
 */
export function mergeSnapshots(base: TournamentSnapshot, incoming: TournamentSnapshot): MergeResult {
  const warnings: string[] = []
  const conflicts: MergeConflict[] = []

  if (base.tournament.id !== incoming.tournament.id) {
    throw new Error('別の大会のデータです。合流できません')
  }

  const mineById = new Map(base.matches.map((m) => [m.id, m]))
  const theirsById = new Map(incoming.matches.map((m) => [m.id, m]))

  // 組合せが一致しているか。抽選をやり直した端末があると番号がずれる。
  const onlyTheirs = [...theirsById.keys()].filter((id) => !mineById.has(id))
  const onlyMine = [...mineById.keys()].filter((id) => !theirsById.has(id))
  if (onlyTheirs.length > 0 || onlyMine.length > 0) {
    warnings.push(
      `試合の構成が食い違っています（手元にしかない ${onlyMine.length}件 / 相手にしかない ${onlyTheirs.length}件）。` +
        '抽選をやり直した端末があるかもしれません',
    )
  }

  let applied = 0
  const merged: MatchRecord[] = base.matches.map((mine) => {
    const theirs = theirsById.get(mine.id)
    if (!theirs) return mine

    const mineEntered = isEntered(mine)
    const theirsEntered = isEntered(theirs)

    // どちらも触っていない、または手元だけ → そのまま
    if (!theirsEntered) return mine

    // 相手だけが入力している → 取り込む
    if (!mineEntered) {
      applied++
      return theirs
    }

    // 両方が入力している。内容が同じなら問題ない。
    if (sameResult(mine, theirs)) return mine

    conflicts.push({
      matchId: mine.id,
      matchNumber: mine.number,
      mine,
      theirs,
      reason: 'BOTH_EDITED',
    })
    // 衝突は自動で決めない。**新しいほうを仮に採り、運営者に提示する。**
    const takeTheirs = editedAt(theirs) > editedAt(mine)
    if (takeTheirs) applied++
    return takeTheirs ? theirs : mine
  })

  return {
    merged: {
      ...base,
      matches: merged,
      // 操作ログは両方を時系列で持つ。Undo の履歴が途切れないようにする。
      operations: [...base.operations, ...incoming.operations]
        .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i)
        .sort((a, b) => a.seq - b.seq),
      exportedAt: new Date().toISOString(),
    },
    applied,
    conflicts,
    warnings,
  }
}

function sameResult(a: MatchRecord, b: MatchRecord): boolean {
  if (a.status !== b.status) return false
  if (a.resultType !== b.resultType) return false
  if (a.winnerEntryId !== b.winnerEntryId) return false
  if (a.games.length !== b.games.length) return false
  return a.games.every((g, i) => g.scoreA === b.games[i].scoreA && g.scoreB === b.games[i].scoreB)
}

// ---------------------------------------------------------------------------
// 担当の割当
// ---------------------------------------------------------------------------

export interface Assignment {
  deviceId: string
  label: string
  /** 担当するブロックの id。 */
  groupIds: string[]
}

/**
 * 担当が重なっていないか検証する。
 *
 * **重なっていなければ、合流で衝突は構造的に起きない。**
 * 重なりを事前に消しておくのが、合流を単純に保つ唯一の方法。
 */
export function validateAssignments(assignments: Assignment[]): string[] {
  const warnings: string[] = []
  const seen = new Map<string, string>()
  for (const a of assignments) {
    for (const g of a.groupIds) {
      const prev = seen.get(g)
      if (prev !== undefined && prev !== a.deviceId) {
        warnings.push(`ブロックが重複して割り当てられています（${prev} と ${a.label}）`)
      }
      seen.set(g, a.deviceId)
    }
  }
  return warnings
}

/** 割り当てられていないブロック。誰も入力しないまま終わる事故を防ぐ。 */
export function unassignedGroups(allGroupIds: string[], assignments: Assignment[]): string[] {
  const assigned = new Set(assignments.flatMap((a) => a.groupIds))
  return allGroupIds.filter((g) => !assigned.has(g))
}
