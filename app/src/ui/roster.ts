// 参加者名簿の貼り付け取り込み。docs/07 F-2-2
//
// **ファイル選択ダイアログを経由させない。** Excel の範囲をコピーして貼るだけ。
// 列の対応づけは自動で推定し、間違っていたら直させる。
//
// 貼り付けたときの形は Excel からだとタブ区切り、CSV からだとカンマ区切りになる。
// どちらも受ける。

export interface ParsedRow {
  /** 貼り付けた表に組の列があれば、その値。無ければ null。 */
  group: string | null
  affiliation: string
  playerNames: string[]
  seed: number | null
}

export interface ParseResult {
  rows: ParsedRow[]
  warnings: string[]
  /** 推定した列の役割。UI で直せるようにする。 */
  columns: ColumnRole[]
}

export type ColumnRole = 'group' | 'affiliation' | 'name' | 'seed' | 'ignore'

/**
 * 組の名前らしい値か。
 *
 * **すでに組合せが決まっている大会のほうが多い。**
 * 申込を締め切ってから運営が手で決め、組合せ表として配ってから当日を迎える。
 * その表をそのまま貼れば、抽選を回さずにその通りに組む。
 *
 * 「A組」「A」「1部A」「男子1部A」など、短くて種類が少ない値を組とみなす。
 */
function looksLikeGroup(v: string): boolean {
  const t = v.trim()
  if (t === '' || t.length > 12) return false
  // **数字だけは組とみなさない。**シード順位の列と見分けが付かなくなる。
  if (isNumeric(t)) return false
  // 「A組」「1部A」のように組で終わるか、英字1〜2文字だけか。
  return /組$/.test(t) || /^[A-Za-zＡ-Ｚａ-ｚ]{1,2}$/.test(t)
}

const SEP = /\t|,|\s{2,}/

function splitLine(line: string): string[] {
  return line.split(SEP).map((c) => c.trim())
}

/** 数字だけならシード順位とみなす。 */
function isNumeric(s: string): boolean {
  return s !== '' && /^\d{1,3}$/.test(s)
}

/**
 * 所属らしい文字列か。
 * クラブ名・学校名には「クラブ」「高校」「中学」「大学」「BC」などが入りやすい。
 */
function looksLikeAffiliation(s: string): boolean {
  return /クラブ|高校|高等|中学|小学|大学|チーム|BC|B\.C|会|連盟|協会|体育館/i.test(s)
}

/** 氏名らしい文字列か。姓名の間に空白が入ることが多い。 */
function looksLikeName(s: string): boolean {
  if (s === '') return false
  if (isNumeric(s)) return false
  return /[\s　]/.test(s) || (s.length >= 2 && s.length <= 12)
}

/** 列の役割を推定する。 */
export function inferColumns(lines: string[][]): ColumnRole[] {
  const width = Math.max(0, ...lines.map((l) => l.length))
  const roles: ColumnRole[] = []

  for (let c = 0; c < width; c++) {
    const cells = lines.map((l) => l[c] ?? '').filter((x) => x !== '')
    if (cells.length === 0) {
      roles.push('ignore')
      continue
    }
    const numeric = cells.filter(isNumeric).length / cells.length
    const aff = cells.filter(looksLikeAffiliation).length / cells.length
    // 組の列は「値の種類が行数よりずっと少ない」ことで見分ける。
    // 6行で1種類なら所属かもしれないが、24行で4種類なら組とみて間違いない。
    const uniq = new Set(cells).size
    // 組の指定は一部だけ空のことがある（あとで決める分を空けてある）。
    // 空欄は判定から外し、**埋まっている値だけ**で見る。
    const filled = lines.length
    const groupish =
      cells.filter(looksLikeGroup).length / cells.length > 0.9 &&
      uniq >= 2 &&
      uniq <= Math.max(2, filled / 2)

    if (groupish) roles.push('group')
    else if (numeric > 0.8) roles.push('seed')
    else if (aff > 0.4) roles.push('affiliation')
    else if (cells.filter(looksLikeName).length / cells.length > 0.5) roles.push('name')
    else roles.push('ignore')
  }

  // 所属が1つも見つからないとき。
  //
  // 「しらかば」「あおぞら」のように、クラブ名らしい語を含まない団体名は珍しくない。
  // そのときは**姓名の間の空白**で見分ける。「山田 太郎」には空白があり、団体名には無い。
  // 重複の多さも手がかりになるが、少人数の名簿では全部の団体が1回ずつしか出ない。
  if (!roles.includes('affiliation')) {
    const nameCols = roles.map((r, i) => (r === 'name' ? i : -1)).filter((i) => i >= 0)
    if (nameCols.length >= 3) {
      const stat = (c: number) => {
        const cells = lines.map((l) => l[c] ?? '').filter((x) => x !== '')
        if (cells.length === 0) return { space: 1, uniq: 1 }
        return {
          space: cells.filter((x) => /[\s　]/.test(x)).length / cells.length,
          uniq: new Set(cells).size / cells.length,
        }
      }
      const stats = nameCols.map((c) => ({ c, ...stat(c) }))
      const spacey = stats.filter((x) => x.space > 0.5).length
      // 空白のある列が他にあるなら、空白のない列が所属。
      const bySpace = stats.filter((x) => x.space <= 0.5)
      if (spacey >= 2 && bySpace.length > 0) {
        roles[bySpace[bySpace.length - 1].c] = 'affiliation'
      } else {
        // 空白で分からなければ、いちばん重複している列を所属とみなす。
        let pick = stats[0]
        for (const x of stats) if (x.uniq <= pick.uniq) pick = x
        if (pick.uniq < 0.9) roles[pick.c] = 'affiliation'
      }
    }
  }

  return roles
}

/**
 * 貼り付けたテキストを解析する。
 *
 * **警告は出すが取り込みはブロックしない**（UX原則5）。
 * 現場では想定外の形の名簿が必ず来る。
 */
export function parseRoster(text: string, override?: ColumnRole[]): ParseResult {
  const warnings: string[] = []
  // **行全体を trim してはならない。**
  // Excel から貼ると、まだ決めていない組の欄が空のまま先頭に来ることがある。
  // 行頭のタブを落とすと列がずれて、以降の推定が全部おかしくなる。
  // 改行と、行末の空白だけを落とす。各セルの前後の空白は splitLine が落とす。
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[\s　]+$/, ''))
    .filter((l) => l.trim() !== '')
    .map(splitLine)

  if (lines.length === 0) return { rows: [], warnings, columns: [] }

  const columns = override ?? inferColumns(lines)
  const rows: ParsedRow[] = []

  for (const [i, cells] of lines.entries()) {
    const names: string[] = []
    let affiliation = ''
    let seed: number | null = null
    let group: string | null = null

    cells.forEach((cell, c) => {
      if (cell === '') return
      switch (columns[c]) {
        case 'group':
          if (group === null) group = cell.trim()
          break
        case 'affiliation':
          if (affiliation === '') affiliation = cell
          break
        case 'name':
          names.push(cell)
          break
        case 'seed':
          if (seed === null) seed = Number(cell)
          break
      }
    })

    if (names.length === 0) {
      warnings.push(`${i + 1}行目に氏名が見つかりません`)
      continue
    }
    rows.push({ group, affiliation, playerNames: names, seed })
  }

  // 人数の揃い方を見る。ダブルスなら全行2名のはず。
  const sizes = new Set(rows.map((r) => r.playerNames.length))
  if (sizes.size > 1) {
    warnings.push(
      `1エントリーの人数が揃っていません（${[...sizes].sort().join(' / ')}名が混在）。列の対応づけを確認してください`,
    )
  }

  // 同じ氏名の重複。
  const seen = new Map<string, number>()
  for (const r of rows) {
    for (const n of r.playerNames) {
      seen.set(n, (seen.get(n) ?? 0) + 1)
    }
  }
  const dup = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n)
  if (dup.length > 0) {
    warnings.push(`同じ氏名が複数あります：${dup.slice(0, 3).join('、')}${dup.length > 3 ? ' ほか' : ''}`)
  }

  // 組の列があれば、抽選を回さずにその通りに組む。運営者に伝える。
  const groups = [...new Set(rows.map((r) => r.group).filter((g): g is string => !!g))]
  if (groups.length > 0) {
    const missing = rows.filter((r) => !r.group).length
    warnings.push(
      missing === 0
        ? `組の指定を読み取りました（${groups.join('・')}）。抽選はせず、この通りに組みます`
        : `組の指定が ${missing} 行で空です。空の行は抽選で振り分けます`,
    )
  }

  // 所属の表記ゆれ。見つけて伝えないと、別団体として集計されてしまう。
  for (const [a, b] of findAffiliationVariants(rows).slice(0, 3)) {
    warnings.push(`所属の書き方が揺れています：「${a}」と「${b}」`)
  }

  return { rows, warnings, columns }
}

/**
 * 所属名の表記ゆれを見つける（F-2-6）。
 * 「〇〇高校」と「〇〇高」のような組を候補として返す。
 */
/**
 * 所属名の表記ゆれを見つける。
 *
 * 現場の名簿では同じ団体が違う書き方で並ぶ。全角と半角、カナの幅、
 * 「クラブ」と「ｸﾗﾌﾞ」、括弧の種類。**これを人が目で探すのが地味に重い**（docs/13 O-1）。
 *
 * 判定は2段構え。
 *   1. NFKC で正規化し、空白と中黒を落として一致するか（幅・カナの違いを吸収する）
 *   2. 片方がもう片方の前方一致で、差が2文字以内か（「〇〇」と「〇〇A」）
 */
function normalizeAffiliation(s: string): string {
  return s.normalize('NFKC').replace(/[\s・･]/g, '').toLowerCase()
}

export function findAffiliationVariants(rows: ParsedRow[]): [string, string][] {
  const names = [...new Set(rows.map((r) => r.affiliation).filter((a) => a !== ''))]
  const out: [string, string][] = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]
      const b = names[j]
      if (a === b) continue
      if (normalizeAffiliation(a) === normalizeAffiliation(b)) {
        out.push([a, b])
        continue
      }
      const [s, l] = a.length <= b.length ? [a, b] : [b, a]
      if (l.startsWith(s) && l.length - s.length <= 2) out.push([a, b])
    }
  }
  return out
}
