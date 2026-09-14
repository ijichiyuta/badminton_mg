// QRコードの生成。**自前実装をやめてライブラリに替えた経緯があるので、
// 「実際に読み取れる」ことだけは必ず押さえる。**構造の検査では見つからない誤りだった。

import { describe, expect, it } from 'vitest'
import { QUIET_ZONE, qrMatrix, qrSvg } from '../qr'

/** 格子を白黒の画素に起こして jsQR に渡す。 */
async function decode(text: string): Promise<string | null> {
  const m = qrMatrix(text)
  const quiet = QUIET_ZONE
  const n = m.length + quiet * 2
  const scale = 4
  const size = n * scale
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gy = Math.floor(y / scale) - quiet
      const gx = Math.floor(x / scale) - quiet
      const on = gy >= 0 && gx >= 0 && gy < m.length && gx < m.length && m[gy][gx] === 1
      const i = (y * size + x) * 4
      const v = on ? 0 : 255
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    }
  }
  const { default: jsQR } = await import('jsqr')
  return jsQR(data, size, size)?.data ?? null
}

describe('**実際に読み取れる**', () => {
  it('短いURL', async () => {
    const url = 'https://a.com/v/1'
    expect(await decode(url)).toBe(url)
  })

  it('速報のURLの長さ', async () => {
    const url = 'https://claude.ai/code/artifact/31a7789e-fa14-97c5-3121322fcc01'
    expect(await decode(url)).toBe(url)
  })

  it('小文字と記号がそのまま戻る', async () => {
    const url = 'https://example.com/v/abcDEF-123?x=1'
    expect(await decode(url)).toBe(url)
  })
})

describe('紙に載せる前提', () => {
  it('SVG で返る', () => {
    expect(qrSvg('https://a.com')).toMatch(/^<svg/)
  })

  it('余白を4モジュール残す。削ると読めなくなる', () => {
    const svg = qrSvg('https://a.com')
    const view = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
    expect(view).not.toBeNull()
    const n = qrMatrix('https://a.com').length
    expect(Number(view?.[1])).toBe(n + QUIET_ZONE * 2)
  })

  it('黒の矩形だけを描く。白は背景で塗る', () => {
    const svg = qrSvg('https://a.com')
    expect(svg).toContain('fill="#fff"')
    expect(svg).toContain('fill="#000"')
  })
})
