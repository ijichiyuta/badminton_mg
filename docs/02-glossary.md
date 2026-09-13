# 用語集

コード内の識別子は英語、UI の表示は日本語。混在させない。

## 大会構造

| 日本語 | 実装名 | 定義 |
|---|---|---|
| 大会 | `Tournament` | 1日または複数日にわたる開催単位 |
| 種目 | `Event` | 男子シングルス、女子ダブルス、A級、団体など。大会内の競技区分 |
| エントリー | `Entry` | 種目への出場単位。個人・ペア・チームのいずれか |
| ステージ | `Stage` | 種目内の進行段階。予選リーグ、決勝トーナメントなど |
| 組 / ブロック | `Group` | リーグ戦の1グループ、またはトーナメントの1ブラケット |
| 試合 | `Match` | 1つの対戦。個人戦では1マッチ、団体戦では1対戦（Tie）を指さない |
| 進行状態 | `status` | 試合がどこまで進んだか。`PENDING`〜`COMPLETED` |
| 結果種別 | `resultType` | どう決まったか。`NORMAL` / `BYE` / `RETIRED` など。`status` と直交する |
| 対戦（団体戦） | `Tie` | チーム対チームの1対戦。内部に複数の `Match` を持つ |
| ゲーム | `Game` | 21点または15点を取り合う単位。1マッチに1〜3 |
| ポイント | `Point` | ゲーム内の得点 |
| 基準点 | `pointsPerGame` | 1ゲームの点数。既定 15、21点制なら 21 |
| 決着上限点 | `maxPoints` | **その点を取った側が勝つ点数。** 15点制=21、21点制=30 |
| デュース開始点 | `deuceFrom` | 両者が並んだらデュースになる点。表示用 |
| インターバル点 | `intervalAt` | この点に達したら60秒。`null` でなし |
| 勝敗の決め方 | `winCondition` | `POINTS`（点数）／ `TIME`（時間制） |
| 制限時間 | `timeLimitMinutes` | 時間制のときのみ |
| コート | `Court` | 会場のコート |
| タイムテーブル枠 | `Slot` | コートと時間の割当 |

## 進行形式

| 日本語 | 実装名 |
|---|---|
| トーナメント（勝ち抜き戦） | `SINGLE_ELIMINATION` |
| リーグ戦 / 総当たり / ブロック戦 | `ROUND_ROBIN` |
| 敗者戦 / 順位別リーグ | `CONSOLATION` |
| 順位決定戦 / 入れ替え戦 | `PLAYOFF` |

「予選リーグ→決勝トーナメント」は形式名ではない。
`ROUND_ROBIN` ステージと `SINGLE_ELIMINATION` ステージを進出ルールで連結したものを指す。

## 競技用語

| 日本語 | 実装名 | 補足 |
|---|---|---|
| シード | `seed` | 抽選対象から外し、ブラケット上の特定位置に固定される選手 |
| 不戦勝 / BYE | `bye` | 対戦相手が存在しない枠。試合は行われない |
| 棄権 | `retired` / `withdrawn` | 試合前の欠場と試合中のリタイアを区別する |
| 失格 | `disqualified` | |
| 没収試合 | `walkover` | |
| 打ち切り | `truncated` | 団体戦で勝敗確定後に残試合を行わないこと |
| オーダー | `lineup` | 団体戦で各試合に誰を出すかの割当 |
| 単 / シングルス | `singles` | |
| 複 / ダブルス | `doubles` | |
| 3複2単 | `3D2S` | ダブルス3試合＋シングルス2試合 |

## 順位決定

| 日本語 | 実装名 |
|---|---|
| 勝利数 | `wins` |
| 勝点 | `points` |
| 母集団スコープ | `tiebreakScope` |
| 当該者間 | `AMONG_TIED` |
| 取得マッチ率 | `matchRatio` |
| 取得ゲーム率 | `gameRatio` |
| 取得ポイント率 | `pointRatio` |
| 得失ゲーム差 | `gameDiff` |
| 得失ポイント差 | `pointDiff` |
| 抽選 | `draw` |
| 未決着時の処理 | `unresolvedAction` |
| 同順位 | `SHARED_RANK` |
| 暫定順位 | `provisional` |

**「率」と「差」は別の概念である。** 大会要項によってどちらを使うかが異なるため、両方を実装する。

**「直接対決」は独立した指標として持たない。**
2者が同率のときに `tiebreakScope = AMONG_TIED` で `wins` を評価した結果が、直接対決そのものである。
→ `docs/adr/0006-tiebreak-scope-model.md`

## 運営負担

| 日本語 | 実装名 / 参照 |
|---|---|
| 要項プリセット | `RankingRuleSet.presetId` |
| ゲーム形式プリセット | `ScoringRuleSet.presetId`（`15pt-3g` など13種） |
| ステージ構成プリセット | `tournament.stageScoringPresetId`（`qual1g-final3g-15pt` など） |
| 連続入力モード | `docs/13-operator-load.md` O-3-1 |
| 部分進出 | `allowPartialAdvancement` |
| オーダー提出状態 | `Tie.lineupStatus` |
