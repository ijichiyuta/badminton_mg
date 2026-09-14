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
      { affiliation: '名古屋高校', playerNames: ['a'], seed: null, group: null },
      { affiliation: '名古屋高', playerNames: ['b'], seed: null, group: null },
      { affiliation: '豊田クラブ', playerNames: ['c'], seed: null, group: null },
    ]
    const v = findAffiliationVariants(rows)
    expect(v).toHaveLength(1)
    expect(v[0].sort()).toEqual(['名古屋高', '名古屋高校'])
  })

  it('関係ない名前は候補にしない', () => {
    const rows = [
      { affiliation: 'あおぞら', playerNames: ['a'], seed: null, group: null },
      { affiliation: 'みどり台', playerNames: ['b'], seed: null, group: null },
    ]
    expect(findAffiliationVariants(rows)).toEqual([])
  })
})

describe('所属の表記ゆれ（実際の名簿で起きる形）', () => {
  // 表記ゆれの判定だけを見る。列の推定を挟むと、そちらの都合で結果が変わってしまう。
  const v = (...affs: string[]) =>
    findAffiliationVariants(affs.map((affiliation) => ({ playerNames: ['甲'], affiliation, seed: null, group: null })))

  it('全角カナと半角カナの違いを見つける', () => {
    expect(v('あおぞらクラブ', 'あおぞらｸﾗﾌﾞ')).toHaveLength(1)
  })

  it('英数字の全角半角の違いを見つける', () => {
    expect(v('ＲＳＮＯＡＮＡＫＡ', 'RSNOANAKA')).toHaveLength(1)
  })

  it('空白や中黒の有無を吸収する', () => {
    expect(v('Ｂｅ Ｓｔｒｏｎｇ Ｊｒ．', 'BeStrongJr.')).toHaveLength(1)
  })

  it('末尾が少し違うだけのものも見つける', () => {
    expect(v('振甫クラブ', '振甫クラブA')).toHaveLength(1)
  })

  it('**別団体を誤って揺れと判定しない**', () => {
    expect(v('しらかば', 'かえで会', 'あおぞら')).toHaveLength(0)
  })

  it('名簿の取り込み結果に警告として出る', () => {
    const r = parseRoster(
      '山田 太郎\t鈴木 一郎\tあおぞらクラブ\n佐藤 次郎\t高橋 三郎\tあおぞらｸﾗﾌﾞ',
    )
    expect(r.warnings.some((w) => w.includes('所属の書き方が揺れています'))).toBe(true)
  })
})

describe('すでに決まっている組合せを貼り付ける', () => {
  // 申込を締め切ったあと、運営が組合せを決めて表を配る。
  // **抽選を回すのではなく、決まったものをそのまま入れるのが実際の流れ。**
  const 組合せ表 = [
    'A組\t山田 太郎\t鈴木 一郎\tしらかば',
    'A組\t佐藤 次郎\t高橋 三郎\tかえで会',
    'A組\t田中 四郎\t伊藤 五郎\tあおぞら',
    'B組\t渡辺 六郎\t中村 七郎\tみどり台',
    'B組\t小林 八郎\t加藤 九郎\tつばさ',
    'B組\t吉田 十郎\t山口 一二\tひまわり',
  ].join('\n')

  it('組の列を見分ける', () => {
    const r = parseRoster(組合せ表)
    expect(r.columns[0]).toBe('group')
    expect(r.rows.map((x) => x.group)).toEqual(['A組', 'A組', 'A組', 'B組', 'B組', 'B組'])
  })

  it('氏名と所属はこれまでどおり読める', () => {
    const r = parseRoster(組合せ表)
    expect(r.rows[0].playerNames).toEqual(['山田 太郎', '鈴木 一郎'])
    expect(r.rows[0].affiliation).toBe('しらかば')
  })

  it('**抽選しない旨を伝える**', () => {
    const r = parseRoster(組合せ表)
    expect(r.warnings.some((w) => w.includes('抽選はせず'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('A組・B組'))).toBe(true)
  })

  it('組が空の行があれば、そこだけ抽選に回すと伝える', () => {
    const r = parseRoster(
      [
        'A組\t山田 太郎\t鈴木 一郎\tしらかば',
        'B組\t佐藤 次郎\t高橋 三郎\tかえで会',
        '\t田中 四郎\t伊藤 五郎\tあおぞら',
      ].join('\n'),
    )
    expect(r.warnings.some((w) => w.includes('1 行で空'))).toBe(true)
  })

  it('「1部A」のような書き方も組とみなす', () => {
    const r = parseRoster(
      ['男子1部A組\t山田 太郎\t鈴木 一郎\tしらかば', '男子1部B組\t佐藤 次郎\t高橋 三郎\tかえで会'].join('\n'),
    )
    expect(r.rows.map((x) => x.group)).toEqual(['男子1部A組', '男子1部B組'])
  })

  it('**組の列がなければ今までどおり**。空欄を返すだけ', () => {
    const r = parseRoster('山田 太郎\t鈴木 一郎\tしらかば\n佐藤 次郎\t高橋 三郎\tかえで会')
    expect(r.rows.every((x) => x.group === null)).toBe(true)
    expect(r.warnings.some((w) => w.includes('抽選はせず'))).toBe(false)
  })

  it('シードの列を組と取り違えない', () => {
    const r = parseRoster('1\t山田 太郎\t鈴木 一郎\tしらかば\n2\t佐藤 次郎\t高橋 三郎\tかえで会')
    expect(r.columns[0]).toBe('seed')
    expect(r.rows.every((x) => x.group === null)).toBe(true)
  })
})
