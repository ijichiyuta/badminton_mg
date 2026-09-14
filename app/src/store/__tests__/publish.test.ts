// 公開用スナップショットの絞り込みテスト。
//
// 個人情報の扱いは間違えると取り返しがつかない。ここは厚く検証する。

import { describe, expect, it } from 'vitest'
import { redact } from '../publish'
import type { TournamentSnapshot } from '../schema'

function snap(): TournamentSnapshot {
  return {
    schemaVersion: 2,
    exportedAt: '2026-09-06T00:00:00Z',
    tournament: {
      id: 't1',
      name: 'テスト大会',
      date: '2026-09-06',
      venue: '体育館',
      organizer: '主催',
      courts: [],
      defaultScoringRuleId: 'r',
      defaultRankingRulePresetId: 'rr',
      stageScoringPresetId: 'uniform-15pt-3g',
      publicToken: 'SECRET-TOKEN',
      schemaVersion: 2,
      createdAt: '',
      updatedAt: '',
    },
    events: [],
    stages: [],
    groups: [],
    entries: [],
    players: [
      {
        id: 'p1',
        tournamentId: 't1',
        name: '山田 太郎',
        kana: 'やまだ たろう',
        affiliation: '○○クラブ',
        note: '090-1234-5678 / 名古屋市...',
      },
      { id: 'p2', tournamentId: 't1', name: '鈴木花子', affiliation: '△△高校' },
    ],
    matches: [],
    scoringRules: [],
    rankingRules: [],
    operations: [
      {
        id: 'op1',
        tournamentId: 't1',
        seq: 1,
        at: '',
        type: 'MATCH_RESULT_ENTERED',
        label: '',
        before: [],
        after: [],
        undoable: true,
        undone: false,
      },
    ],
  }
}

const FULL = { nameVisibility: 'FULL' as const }

describe('常に落とすもの', () => {
  it('更新用トークンを送らない', () => {
    expect(redact(snap(), FULL).tournament.publicToken).toBeNull()
  })

  it('操作ログを送らない', () => {
    expect(redact(snap(), FULL).operations).toEqual([])
  })

  it('選手の note（連絡先・住所が入りうる）を落とす', () => {
    const p = redact(snap(), FULL).players[0] as unknown as Record<string, unknown>
    expect(p.note).toBeUndefined()
  })

  it('かなも落とす。公開に必要ない', () => {
    const p = redact(snap(), FULL).players[0] as unknown as Record<string, unknown>
    expect(p.kana).toBeUndefined()
  })

  it('残るのは id・tournamentId・name・affiliation だけ', () => {
    const p = redact(snap(), FULL).players[0]
    expect(Object.keys(p).sort()).toEqual(['affiliation', 'id', 'name', 'tournamentId'])
  })
})

describe('氏名の公開範囲', () => {
  it('FULL はそのまま', () => {
    expect(redact(snap(), FULL).players[0].name).toBe('山田 太郎')
  })

  it('FAMILY_ONLY は姓だけにする', () => {
    const r = redact(snap(), { nameVisibility: 'FAMILY_ONLY' })
    expect(r.players[0].name).toBe('山田')
  })

  it('全角スペース区切りでも姓を取り出せる', () => {
    const s = snap()
    s.players[0].name = '山田　太郎'
    expect(redact(s, { nameVisibility: 'FAMILY_ONLY' }).players[0].name).toBe('山田')
  })

  it('区切りがなければそのまま残す（誤って切らない）', () => {
    const r = redact(snap(), { nameVisibility: 'FAMILY_ONLY' })
    expect(r.players[1].name).toBe('鈴木花子')
  })

  it('AFFILIATION_ONLY は氏名を空にする', () => {
    const r = redact(snap(), { nameVisibility: 'AFFILIATION_ONLY' })
    expect(r.players[0].name).toBe('')
    expect(r.players[0].affiliation).toBe('○○クラブ')
  })
})

describe('元のデータを壊さない', () => {
  it('redact は入力を変更しない', () => {
    const s = snap()
    redact(s, { nameVisibility: 'AFFILIATION_ONLY' })
    expect(s.players[0].name).toBe('山田 太郎')
    expect(s.tournament.publicToken).toBe('SECRET-TOKEN')
    expect(s.operations).toHaveLength(1)
  })
})
