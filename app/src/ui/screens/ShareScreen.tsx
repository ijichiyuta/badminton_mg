// 速報のリンクを渡す画面。
//
// **URLを紙に書いても打ってもらえない。**会場でやることは
// 「この画面を見せる」か「この紙を貼る」の2つだけにする。
//
// 印刷して壁に貼れるよう、QRは大きく出す。3cm を切ると読み取りが安定しない。

import { useMemo } from 'react'
import { qrSvg } from '../qr'

interface Props {
  url: string
  tournamentName: string
  onBack: () => void
}

export function ShareScreen({ url, tournamentName, onBack }: Props) {
  const svg = useMemo(() => qrSvg(url), [url])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-rule px-3 py-2 no-print">
        <button
          onClick={onBack}
          className="rounded border border-rule px-3 text-sm"
          style={{ minHeight: 44 }}
        >
          ‹ 戻る
        </button>
        <span className="text-sm text-ink-2">参加者に見せる</span>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded bg-primary px-4 font-bold text-paper"
          style={{ minHeight: 44 }}
        >
          印刷する
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="print-page mx-auto max-w-md px-4 py-6 text-center">
          <div className="text-sm text-ink-2">{tournamentName}</div>
          <h2 className="mt-1 text-xl font-bold">試合結果はこちら</h2>
          <p className="mt-1 text-sm text-ink-2">
            スマホのカメラで下のコードを写すと、星取表と順位が見られます。
          </p>

          {/* 大きく出す。壁に貼ったとき離れていても読める大きさが要る。 */}
          <div
            className="mx-auto mt-4 w-full max-w-[280px]"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前で組んだ SVG のみ
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <div className="mt-3 break-all rounded border border-rule px-3 py-2 text-xs text-ink-2">
            {url}
          </div>
          <p className="mt-3 text-xs text-ink-3">
            コードが読めないときは、上のアドレスを直接入力してください。
          </p>
        </div>
      </div>
    </div>
  )
}
