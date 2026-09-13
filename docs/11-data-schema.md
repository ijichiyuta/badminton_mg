# データスキーマ案

エクスポート／インポートおよび同期で使う JSON の構造案。
実装時に調整してよいが、**バージョン番号を必ず持たせる**こと。

**`schemaVersion` は 2。** 旧版（1）からの変更点は本ファイル末尾を参照。

```jsonc
{
  "schemaVersion": 2,
  "tournament": {
    "id": "string",
    "name": "string",
    "date": "2026-00-00",
    "venue": "string",
    "organizer": "string",
    "courts": [{ "id": "string", "name": "1番コート" }],
    "defaultScoringRule": { /* ScoringRuleSet */ },
    "defaultRankingRule": { /* RankingRuleSet */ },
    "stageScoringPresetId": "uniform-15pt-3g",  // ステージ構成プリセット。docs/06-scoring.md
    "publicToken": null,              // 公開ページの更新用トークン。任意。端末内データは暗号化しない
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  },

  "players": [
    {
      "id": "string",
      "name": "山田 太郎",
      "kana": "やまだ たろう",
      "affiliation": "〇〇クラブ",
      "region": "string",
      "grade": "string",
      "note": "string"
    }
  ],

  "events": [
    {
      "id": "string",
      "name": "男子ダブルスA級",
      "discipline": "MD",          // MS | WS | MD | WD | XD | TEAM
      "category": "A級",
      "entryType": "PAIR",          // INDIVIDUAL | PAIR | TEAM
      "scoringRule": null,          // null なら大会の既定値を継承
      "rankingRule": null,
      "teamFormat": null,           // 団体戦のみ
      "entries": [
        {
          "id": "string",
          "playerIds": ["string"],
          "teamName": "string",     // TEAM のみ
          "seed": 1,
          "status": "ACTIVE"        // ACTIVE | WITHDRAWN | SUBSTITUTED
        }
      ],
      "stages": [
        {
          "id": "string",
          "order": 1,
          "name": "予選リーグ",
          "type": "ROUND_ROBIN",    // SINGLE_ELIMINATION | ROUND_ROBIN | CONSOLATION | PLAYOFF
          "scoringRule": null,      // null なら Event → Tournament の順に継承
                                    // 「予選1ゲーム／決勝3ゲーム」はここで表現する
          "advancementRule": {
            "fromStageId": null,
            "topNPerGroup": 0,
            "wildcards": 0,
            "placement": "CROSS",   // CROSS | SEQUENTIAL | MANUAL
            "separateSameAffiliation": true,
            "allowPartialAdvancement": true   // 一部ブロックのみ完了でも流し込む
          },
          "options": {
            "bracketSize": 16,      // SINGLE_ELIMINATION のみ
            "thirdPlaceMatch": false,
            "fifthToEighthMatch": false,
            "carryOverResults": false,
            "carryOverScope": "MATCH_RESULT_ONLY"   // MATCH_RESULT_ONLY | FULL_STATS
                                                    // 予選と決勝の採点方式が異なれば自動で前者
          },
          "truncate": false,        // 団体戦の打ち切り。Tie ではなく Stage が持つ
          "groups": [
            {
              "id": "string",
              "name": "A組",
              "entryIds": ["string"],
              "scoringRule": null     // null なら Stage → Event → Tournament の順に継承
                                      // チーム数の多いブロックだけ延長なしにする等
            }
          ],
          "slots": [
            // SINGLE_ELIMINATION のみ。進出元が未確定な枠を保持する
            { "position": 3, "entryId": null, "label": "C組1位（未確定）" }
          ],
          "matchIds": ["string"]
        }
      ]
    }
  ],

  "matches": [
    {
      "id": "string",
      "eventId": "string",
      "stageId": "string",
      "groupId": "string",
      "tieId": null,                // 団体戦の内部試合なら親 Tie の id
      "number": 35,             // 大会全体の通し試合番号。タイムテーブルとスコアシートで使う
      "numberInGroup": 3,       // ブロック内の試合順。星取表に丸数字で入る（①〜⑩）
      "round": 1,
      "slotInRound": 3,
      "entryIds": ["string", "string"],

      // ★ status と resultType は直交する。旧版は1つの enum に混ぜていた
      "status": "COMPLETED",        // PENDING | READY | SCHEDULED | IN_PROGRESS | COMPLETED
      "resultType": "NORMAL",       // NORMAL | BYE | WALKOVER | RETIRED | WITHDRAWN | DISQUALIFIED | NOT_PLAYED

      "games": [
        { "scoreA": 15, "scoreB": 11 },
        { "scoreA": 13, "scoreB": 15 },
        { "scoreA": 15, "scoreB": 12 }
      ],
      "winnerEntryId": "string",    // NOT_PLAYED のときのみ null
      "retiredEntryId": null,       // RETIRED / WITHDRAWN / DISQUALIFIED のとき、退いた側
      "scoringRuleId": "string",    // 適用された ScoringRuleSet の参照。混在検知に使う
      "courtId": "string",
      "scheduledAt": "ISO8601",
      "completedAt": "ISO8601",
      "nextMatchId": "string",      // 勝者の進む先
      "loserNextMatchId": null      // 敗者戦がある場合
    }
  ],

  "ties": [
    {
      "id": "string",
      "eventId": "string",
      "stageId": "string",
      "groupId": "string",
      "teamEntryIds": ["string", "string"],
      "format": "3D",
      "order": ["D1", "D2", "D3"],
      "slotConstraints": {
        "D1": { "discipline": "WD", "gender": ["F", "F"] },
        "D2": { "discipline": "MD", "gender": ["M", "M"] },
        "D3": { "discipline": "XD", "gender": ["M", "F"] }
      },

      // ★ オーダーは「未提出」という状態を持つ
      "lineupStatus": "BOTH_SUBMITTED",   // NOT_SUBMITTED | ONE_SUBMITTED | BOTH_SUBMITTED
      "lineups": {
        "teamEntryIdA": {
          "submittedAt": "ISO8601",
          "assignments": { "D1": ["playerId", "playerId"], "S1": ["playerId"] }
        }
      },

      "matchIds": ["string"],
      "winnerEntryId": "string",
      "status": "COMPLETED"         // PENDING | READY | SCHEDULED | IN_PROGRESS | COMPLETED
                                    // truncate は Stage が持つ（Tie は持たない）
    }
  ],

  // ★ 派生データ。キャッシュであり、正ではない
  "rankingsCache": [
    {
      "stageId": "string",
      "groupId": "string",
      "provisional": false,         // 当該者間の対戦が未消化なら true
      "ruleSetHash": "string",      // 元にした RankingRuleSet のハッシュ。不一致なら破棄して再計算
      "warnings": ["MIXED_SCORING_RULE"],
      "entries": [
        {
          "rank": 1,
          "entryId": "string",
          "wins": 3, "losses": 0,
          "gamesWon": 6, "gamesLost": 1,
          "pointsWon": 90, "pointsLost": 68,
          "reason": "3勝0敗"
        }
      ],
      "computedAt": "ISO8601"
    }
  ],

  "operationLog": [
    {
      "id": "string",
      "at": "ISO8601",
      "type": "MATCH_RESULT_ENTERED",   // DRAW_EXECUTED | LINEUP_SUBMITTED | ENTRY_SUBSTITUTED | ...
      "payload": {},
      "undoable": true
    }
  ]
}
```

## RankingRuleSet

```jsonc
{
  "criteria": ["wins", "gameRatio", "pointRatio"],
  "tiebreakScope": "AMONG_TIED",      // AMONG_TIED | ALL_MATCHES | AMONG_TIED_IF_TWO
  "unresolvedAction": "DRAW",         // DRAW | SHARED_RANK | PLAYOFF
  "pointsForWin": 1,
  "pointsForLoss": 0,
  "pointsForRetirement": -1,
  "withdrawnHandling": "BASE_POINT_TO_ZERO",  // BASE_POINT_TO_ZERO | ZERO_ZERO | EXCLUDE
  "retiredHandling": "KEEP_POINTS",           // KEEP_POINTS | WIN_ONLY
  "disqualifiedHandling": "SAME_AS_RETIRED",
  "walkoverHandling": "SAME_AS_RETIRED",
  "removeWithdrawnMatches": false,
  "removeFromOpponents": false,
  "drawSeed": null,
  "presetId": "standard-among-tied"
}
```

- `criteria` から **`headToHead` を削除した。** 2者の直接対決は `tiebreakScope: AMONG_TIED` で
  `criteria[0]` を評価した結果として得られる（`docs/adr/0006`）
- `criteria` の末尾に `draw` を置かない。未決着は `unresolvedAction` で扱う
- `BASE_POINT_TO_ZERO` は `ScoringRuleSet.pointsPerGame` を参照する。
  **`21-0` ではない。** 15点制なら `15-0`

## ScoringRuleSet

```jsonc
{
  "id": "string",
  "presetId": "15pt-3g",
  "winCondition": "POINTS",   // POINTS | TIME
  "pointsPerGame": 15,
  "gamesPerMatch": 3,
  "gamesToWin": 2,
  "twoPointLead": true,       // false = 「打切り」＝延長なし。基準点先取で決着
  "deuceFrom": 14,            // 表示用。判定には使わない
  "maxPoints": 21,            // この点を取った側が勝つ。null なら上限なし。17 / 21 / 15 が実在
  "intervalAt": 8,            // null でインターバルなし
  "timeLimitMinutes": null    // winCondition = TIME のときのみ
}
```

既定は 15点3ゲーム制（`15pt-3g`）。プリセット一覧は `docs/06-scoring.md`。

| presetId | 点数 | G数 | 先取 | 延長 | 上限 | IV |
|---|---|---|---|---|---|---|
| **`15pt-3g-cap21`（既定）** | 15 | 3 | 2 | 14オール2点差 | 21 | 8 |
| `15pt-3g-cap17` | 15 | 3 | 2 | 14オール2点差 | 17 | 8 |
| `15pt-3g-nodeuce` | 15 | 3 | 2 | **なし** | 15 | 8 |
| `15pt-3g-nocap` | 15 | 3 | 2 | 2点差 | null | 8 |
| `15pt-1g` | 15 | 1 | 1 | 14オール2点差 | 21 | 8 |
| `21pt-3g` | 21 | 3 | 2 | 20オール2点差 | 30 | 11 |
| `21pt-3g-nocap` | 21 | 3 | 2 | 2点差 | null | 11 |
| `21pt-1g` | 21 | 1 | 1 | 20オール2点差 | 30 | 11 |
| `11pt-3g` | 11 | 3 | 2 | 10オール2点差 | 15 | null |
| `11pt-1g` | 11 | 1 | 1 | 10オール2点差 | 15 | null |
| `9pt-1g` | 9 | 1 | 1 | なし | 9 | null |
| `7pt-1g` | 7 | 1 | 1 | なし | 7 | null |
| `time-10min` | — | 1 | 1 | — | — | null |
| `time-7min` | — | 1 | 1 | — | — | null |
| `custom` | 自由 | 自由 | 自由 | 自由 | 自由 | 自由 |

`winCondition = TIME` では `pointsPerGame` と `maxPoints` を `null` にし、
`timeLimitMinutes` を設定する。勝敗はスコアの高い方で決まる。

### ステージ構成プリセット

`tournament.stageScoringPresetId` に持つ。各 Stage の `scoringRule` を一括で埋めるための定義。

| ID | 予選リーグ | 決勝トーナメント |
|---|---|---|
| **`uniform-15pt-3g`（既定）** | `15pt-3g` | `15pt-3g` |
| `qual1g-final3g-15pt` | `15pt-1g` | `15pt-3g` |
| `uniform-21pt-3g` | `21pt-3g` | `21pt-3g` |
| `qual1g-final3g-21pt` | `21pt-1g` | `21pt-3g` |
| `qual11pt-final15pt` | `11pt-3g` | `15pt-3g` |
| `qualtime-final3g-15pt` | `time-10min` | `15pt-3g` |
| `manual` | ステージごとに個別指定 | — |

ステージが3段階以上ある場合、**最後に指定された方式を以降のステージへ引き継ぐ**。

## 旧版（schemaVersion 1）からの変更点とマイグレーション

| # | 変更 | マイグレーション |
|---|---|---|
| 1 | Match の `status` と `resultType` を分離 | 旧 `status` が `BYE` `WALKOVER` `RETIRED` `WITHDRAWN` `DISQUALIFIED` `NOT_PLAYED` なら、`status = COMPLETED` とし `resultType` へ移す。それ以外は `resultType = NORMAL` |
| 2 | `RankingRuleSet.criteria` から `headToHead` を削除 | `headToHead` を除去し、含まれていたなら `tiebreakScope = AMONG_TIED` を設定 |
| 3 | `criteria` 末尾の `draw` を削除 | 除去し `unresolvedAction = DRAW` を設定 |
| 4 | `retirementHandling` を4つの設定へ分解 | `recordAs: "21-0"` → `withdrawnHandling: "BASE_POINT_TO_ZERO"`、`"0-0"` → `ZERO_ZERO`、`"EXCLUDE"` → `EXCLUDE` |
| 5 | `ScoringRuleSet` の既定を21点制から15点制へ | **既存データの値は変更しない。** 新規作成時の既定のみ変更 |
| 6 | `maxPoints` の定義を「決着点」に固定 | 旧値 `30`（21点制）はそのまま。`29` が入っていたら `30` へ補正 |
| 7 | `rankings` → `rankingsCache`。`provisional` と `ruleSetHash` を追加 | 旧データは破棄して再計算する（派生データのため安全） |
| 8 | Tie に `lineupStatus` と `submittedAt` を追加 | `lineups` が空なら `NOT_SUBMITTED`、片側なら `ONE_SUBMITTED` |
| 9 | Stage に `slots` を追加（部分進出の未確定枠） | 空配列で初期化 |
| 10 | Entry の `status` に `SUBSTITUTED` を追加 | 既存はすべて現状維持 |
| 11 | Match に `scoringRuleId` を追加 | 所属 **Stage** の実効 ScoringRuleSet を設定（Stage → Event → Tournament の順に解決） |
| 12 | `tournament.publicToken` を追加 | `null` で初期化 |
| 13 | **Stage に `scoringRule` を追加**（上書き粒度を3段階へ） | `null` で初期化。既存は Event → Tournament から継承され、挙動は変わらない |
| 14 | `tournament.stageScoringPresetId` を追加 | 全ステージが同一方式なら対応するプリセット、異なるなら `manual` |
| 15 | `ScoringRuleSet` に `winCondition` / `timeLimitMinutes` を追加 | `POINTS` / `null` で初期化 |
| 16 | `ScoringRuleSet` に `twoPointLead` / `deuceFrom` / `intervalAt` を明示 | 旧 `deuce: true` → `twoPointLead: true` かつ `deuceFrom = pointsPerGame - 1` |
| 17 | `ScoringRuleSet` に `presetId` を追加 | 値が既知のプリセットと一致すればその ID、しなければ `custom` |
| 18 | Stage の options に `carryOverScope` を追加 | 予選と決勝の `ScoringRuleSet` を比較し、同一なら `FULL_STATS`、異なれば `MATCH_RESULT_ONLY` |
| 19 | **Group に `scoringRule` を追加**（上書き粒度を4段階へ） | `null` で初期化。挙動は変わらない |
| 20 | **`truncate` を Tie から Stage へ移す** | Stage 内の Tie が全て同じ値ならその値、混在していれば `false`（安全側） |
| 21 | Tie に `slotConstraints` を追加 | `null` で初期化。制約なしとして扱う |
| 22 | Match の `number` を文字列から**通し番号（整数）**へ。`numberInGroup` を追加 | 旧 `number` は `label` として保持し、通し番号を振り直す |
| 23 | `RankingRuleSet` の既定を `[wins, gameRatio, pointDiff]` / `ALL_MATCHES` へ | **既存データの値は変更しない。** 新規作成時の既定のみ変更 |

**マイグレーションは片方向でよい。** 旧バージョンへのダウングレードは提供しない。
インポート時に `schemaVersion` が未知の値だった場合、読み込みを拒否せず警告を出して
可能な範囲で読む（UX原則5）。
