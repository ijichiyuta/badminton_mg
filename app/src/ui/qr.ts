// QRコードの生成。
//
// 会場でURLを渡す手段が要る。**紙に書いたURLは打ってもらえない。**
// オフラインで動く必要があるので外部のQR生成APIは使えない（docs/16）。
// バンドルに含まれるライブラリなら、その条件を満たす。
//
// **一度は自前で実装した。構造の検査は通ったのに、読み取りが通らなかった。**
// 形式情報の配置とマスクの扱いに誤りがあり、目視では分からない類の問題だった。
// `src/ui/scoresheet.ts` に「自前実装は誤りが入りやすいので後回し」と書いてあったとおりで、
// ここは素直にライブラリに任せる。

import QRCode from 'qrcode'

/** 1が黒。余白は含まない。 */
export function qrMatrix(text: string): (0 | 1)[][] {
  // 誤り訂正は M。会場の紙は汚れるし折り目も付く。
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = modules.size
  const out: (0 | 1)[][] = []
  for (let y = 0; y < n; y++) {
    const row: (0 | 1)[] = []
    for (let x = 0; x < n; x++) row.push(modules.get(x, y) ? 1 : 0)
    out.push(row)
  }
  return out
}

/** 規格どおりの余白。4モジュール分。削ると読めなくなる。 */
export const QUIET_ZONE = 4

/**
 * 紙にも画面にも載せられる SVG を組む。
 *
 * 1モジュールを1単位として viewBox を切るので、表示サイズは呼び出し側で決められる。
 * 印刷では小さくしすぎないこと。**3cm を切ると読み取りが安定しない。**
 */
export function qrSvg(text: string): string {
  const m = qrMatrix(text)
  const n = m.length + QUIET_ZONE * 2
  const rects: string[] = []
  for (let y = 0; y < m.length; y++) {
    let run = 0
    for (let x = 0; x <= m.length; x++) {
      if (x < m.length && m[y][x] === 1) {
        run++
        continue
      }
      if (run > 0) {
        rects.push(
          `<rect x="${x - run + QUIET_ZONE}" y="${y + QUIET_ZONE}" width="${run}" height="1"/>`,
        )
        run = 0
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="#fff"/>` +
    `<g fill="#000">${rects.join('')}</g></svg>`
  )
}
