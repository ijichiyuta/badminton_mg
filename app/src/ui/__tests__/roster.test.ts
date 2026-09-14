// 名簿の貼り付け取り込みのテスト。
// 現場では想定外の形の名簿が必ず来る。警告は出すがブロックしない。

import { describe, expect, it } from 'vitest'
import { findAffiliationVariants, inferColumns, parseRoster } from '../roster'

describe('Excel からの貼り付け（タブ区切り）', () => {
  const text = [
    '○○クラブ\t山田 太郎\t佐藤 次郎',
    '△△高校\t鈴木 花子\t高橋 桃子',
    '○○クラブ\t田中 一郎\t伊藤 二郎',
  ].join('\n')

  it('3エントリーを読み取る', () => {
    expect(parseRoster(text).rows).toHaveLength(3)
  })

  it('所属と氏名を分ける', () => {
    const r = parseRoster(text).rows[0]
    expect(r.affiliation).toBe('○○クラブ')
    expect(r.playerNames).toEqual(['山田 太郎', '佐藤 次郎'])
  })

  it('警告は出ない', () => {
    expect(parseRoster(text).warnings).toEqual([])
  })
})

describe('CSV からの貼り付け（カンマ区切り）', () => {
  it('同じように読める', () => {
    const r = parseRoster('○○クラブ,山田 太郎,佐藤 次郎').rows[0]
    expect(r.affiliation).toBe('○○クラブ')
    expect(r.playerNames).toHaveLength(2)
  })
})

describe('シード順位の列', () => {
  it('数字だけの列をシードとして拾う', () => {
    const text = ['1\t○○クラブ\t山田 太郎\t佐藤 次郎', '2\t△△高校\t鈴木 花子\t高橋 桃子'].join('\n')
    const r = parseRoster(text)
    expect(r.columns[0]).toBe('seed')
    expect(r.rows[0].seed).toBe(1)
  })
})

describe('所属の列が無いとき', () => {
  it('先頭列の重複が多ければ所属とみなす', () => {
    const text = ['あおぞら\t山田 太郎\t佐藤 次郎', 'あおぞら\t田中 一郎\t伊藤 二郎', 'みどり台\t鈴木 花子\t高橋 桃子'].join('\n')
    const r = parseRoster(text)
    expect(r.rows[0].affiliation).toBe('あおぞら')
  })
})

describe('シングルス（1名）', () => {
  it('1名でも読める', () => {
    const text = ['○○クラブ\t山田 太郎', '△△高校\t鈴木 花子'].join('\n')
    const r = parseRoster(text)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].playerNames).toEqual(['山田 太郎'])
    expect(r.warnings).toEqual([])
  })
})

describe('警告は出すがブロックしない', () => {
  it('人数が揃っていなければ警告する', () => {
    const text = ['○○クラブ\t山田 太郎\t佐藤 次郎', '△△高校\t鈴木 花子'].join('\n')
    const r = parseRoster(text)
    expect(r.rows).toHaveLength(2)
    expect(r.warnings.some((w) => w.includes('人数'))).toBe(true)
  })

  it('同じ氏名が複数あれば警告する', () => {
    const text = ['○○クラブ\t山田 太郎\t佐藤 次郎', '△△高校\t山田 太郎\t高橋 桃子'].join('\n')
    const r = parseRoster(text)
    expect(r.warnings.some((w) => w.includes('同じ氏名'))).toBe(true)
    expect(r.rows).toHaveLength(2)
  })

  it('氏名が無い行は飛ばして警告する', () => {
    const text = ['○○クラブ\t山田 太郎\t佐藤 次郎', '\t\t'].join('\n')
    const r = parseRoster(text)
    expect(r.rows).toHaveLength(1)
  })
})

describe('空・空白', () => {
  it('空文字なら何も返さない', () => {
    expect(parseRoster('').rows).toEqual([])
  })
  it('空行を飛ばす', () => {
    const r = parseRoster('○○クラブ\t山田 太郎\t佐藤 次郎\n\n\n△△高校\t鈴木 花子\t高橋 桃子')
    expect(r.rows).toHaveLength(2)
  })
})

describe('列の対応づけを上書きできる', () => {
  it('推定が違っていたら直せる', () => {
    const text = '山田 太郎\t佐藤 次郎\t○○クラブ'
    const r = parseRoster(text, ['name', 'name', 'affiliation'])
    expect(r.rows[0].affiliation).toBe('○○クラブ')
    expect(r.rows[0].playerNames).toEqual(['山田 太郎', '佐藤 次郎'])
  })
})

describe('inferColumns', () => {
  it('クラブ名らしい列を所属と判定する', () => {
    const roles = inferColumns([
      ['あおぞらクラブ', '山田 太郎', '佐藤 次郎'],
      ['みどり台高校', '鈴木 花子', '高橋 桃子'],
    ])
    expect(roles[0]).toBe('affiliation')
    expect(roles[1]).toBe('name')
  })
})

describe('所属の表記ゆれ', () => {
  it('「○○高校」と「○○高」を候補に出す', () => {
    const rows = [
      { affiliation: '名古屋高校', playerNames: ['a'], seed: null },
      { affiliation: '名古屋高', playerNames: ['b'], seed: null },
      { affiliation: '豊田クラブ', playerNames: ['c'], seed: null },
    ]
    const v = findAffiliationVariants(rows)
    expect(v).toHaveLength(1)
    expect(v[0].sort()).toEqual(['名古屋高', '名古屋高校'])
  })

  it('関係ない名前は候補にしない', () => {
    const rows = [
      { affiliation: 'あおぞら', playerNames: ['a'], seed: null },
      { affiliation: 'みどり台', playerNames: ['b'], seed: null },
    ]
    expect(findAffiliationVariants(rows)).toEqual([])
  })
})
