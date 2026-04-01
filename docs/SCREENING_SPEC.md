# 音声書き起こしスクリーニング仕様書

## 概要

音声認識（WhisperX / Gemini等）で生成された書き起こしテキストを、Gemini APIを用いて
以下の3タスクを同時実行することで品質を向上させるシステム。

---

## スクリーニングの3タスク

### タスク1: コンテキスト自動検出（detectedContext）

**目的**: ユーザーが手動で分析コンテキストを入力しなくても、Geminiがテキストから
トピックを自動検出して以降の分析精度を向上させる。

**出力**: `detectedContext` — 50〜100文字の日本語要約

**例**:
```
"映画監督インタビュー。低予算映画製作・興行収入・ホラー映画（パラノーマルアクティビティ等）について話している。"
```

**用途**:
- 次回同テキストのスクリーニング呼び出し時に `context` として渡す（精度向上）
- UIに「検出コンテキスト」として表示（ユーザーへのフィードバック）
- ユーザーが手動で上書きした場合は手動値を優先

---

### タスク2: 誤認識語句の検出と修正（issues）

**目的**: 音声認識エンジンが生成した**音声上の誤認識**を検出・修正候補を返す。

#### 対象となる誤認識パターン

| パターン | 説明 | 例 |
|----------|------|----|
| 固有名詞の音韻崩壊 | 映画・人名・作品名が音声上で崩れた | `カミトミ` → `カメ止め（カメラを止めるな！）` |
| 同音異義語 | 文脈上で明らかに別の語が正解 | `行く` vs `逝く` |
| 空耳（モーラ置換） | 特定の音節が別の音節に置換 | `アクティビリティ` → `アクティビティ` |
| 略称の誤認識 | 正式名称の略称が音声で崩れた | `ヨウツベ` → `YouTube` |
| 英語固有名詞の片仮名誤り | 外来語が音声エンジンで崩れた | `ブリーウィッチ` → `ブレア・ウィッチ` |

#### 検出ルール

1. **文脈依存**: テキスト全体のトピックを踏まえて判断する
   - 映画の話をしていれば「カミトミ」は映画タイトルの崩れと推定
   - テックの話をしていれば「アップル」は Apple Inc. と推定

2. **テキスト内存在の確認**: `original` に指定する語はテキスト中に必ず存在すること

3. **確信度の基準**:
   - `confidence >= 0.85`: ほぼ確実（アプリがUIで強調表示）
   - `0.65 <= confidence < 0.85`: 可能性あり（警告として表示）
   - `confidence < 0.65`: 返さない（ノイズになる）

4. **フィラー語は検出しない**: 「えーと」「あのー」「なんか」等は誤認識ではないため除外

#### issueオブジェクト仕様

```typescript
interface TranscriptionProofreadIssue {
  original: string;      // テキスト中の誤認識語（完全一致する文字列）
  type: TranscriptionIssueType;
  severity: 'error' | 'warning' | 'info';
  message: string;       // 日本語での説明
  suggestion?: string;   // 修正候補（確信度が高い場合必須）
  confidence: number;    // 0.65〜1.0
}

type TranscriptionIssueType =
  | 'misrecognition'  // 音声認識の誤認識（最重要）
  | 'homophone'       // 同音異義語
  | 'properNoun'      // 固有名詞の表記誤り
  | 'filler'          // フィラー
  | 'context'         // 文脈的不自然さ
  | 'punctuation';    // 句読点
```

#### 悪い例（返してはいけない）

```json
// ✕ テキストに存在しない語
{ "original": "カメラを止めるな", "suggestion": "カメ止め" }
// → テキストに「カメラを止めるな」がなければ返さない

// ✕ 確信度が低すぎる
{ "original": "映画", "suggestion": "映像", "confidence": 0.3 }
// → 一般語への置換は不可

// ✕ 正しい語を誤認識扱いにする
{ "original": "パラノーマルアクティビティ" }
// → 正式タイトルであれば issues には含めない
```

#### 良い例

```json
{
  "original": "カミトミ",
  "type": "misrecognition",
  "severity": "error",
  "message": "映画タイトル「カメ止め（カメラを止めるな！）」の音声認識誤りと推定",
  "suggestion": "カメ止め",
  "confidence": 0.88
}
```

---

### タスク3: 固有名詞の検出と正規化（detectedNouns）

**目的**: テキスト中の固有名詞を検出し、正規形（公式表記）に正規化して返す。

#### 検出対象カテゴリ

| category | 対象 | 例 |
|----------|------|----|
| `person` | 実在の人名・キャラクター名 | 浅尾、スピルバーグ、タランティーノ |
| `place` | 実在の地名・施設名 | 渋谷、ハリウッド、六本木ヒルズ |
| `organization` | 会社・団体・ブランド名 | Apple、NHK、4S |
| `work` | 作品タイトル | パラノーマル・アクティビティ、スター・ウォーズ |
| `technical` | 製品・サービス・商標 | iPhone、WhisperX、YouTube |

#### 正規化ルール

| 元の表記 | 正規形 | 理由 |
|----------|--------|------|
| `youtube` | `YouTube` | 登録商標の公式大文字表記 |
| `iphone` | `iPhone` | Apple公式表記 |
| `zoom` | `Zoom` | 固有名詞の先頭大文字 |
| `macbook` | `MacBook` | Apple公式表記 |
| `タランティーノ` | `クエンティン・タランティーノ` | フルネームが一般的に認知されている場合 |

**制約**: `term` に対応する語は必ずテキスト中に部分一致で存在すること。
正規化により大文字小文字が変わるのは問題ないが（case-insensitive検索で対応可能）、
全く異なる語に置換することは禁止。

---

## レスポンスJSON仕様

```json
{
  "detectedContext": "映画監督インタビュー。低予算ホラー映画の興行収入・制作手法について話している。",
  "issues": [
    {
      "original": "カミトミ",
      "type": "misrecognition",
      "severity": "error",
      "message": "映画「カメ止め（カメラを止めるな！）」の音声認識誤りと推定",
      "suggestion": "カメ止め",
      "confidence": 0.88
    }
  ],
  "detectedNouns": [
    {
      "term": "パラノーマル・アクティビティ",
      "reading": null,
      "category": "work",
      "context": "パラノーマルアクティビティとかって",
      "confidence": 0.97,
      "isNew": true
    },
    {
      "term": "iPhone",
      "reading": "アイフォーン",
      "category": "technical",
      "context": "iPhoneで映画撮りました",
      "confidence": 0.99,
      "isNew": false
    }
  ]
}
```

---

## プロンプト設計原則

### 1. コンテキスト優先度

```
手動入力コンテキスト > Gemini自動検出コンテキスト > なし
```

- ユーザーが手動でコンテキストを入力した場合は常にそちらを使用
- 未入力の場合、前回Geminiが検出した `detectedContext` を `context` として渡す
- 初回は context なしで呼び出し、応答の `detectedContext` を保存して次回に活用

### 2. ハルシネーション防止

- 「テキストに存在しない語を返すな」を明示
- `original` フィールドは必ずテキスト中に存在する語
- `suggestion` は知識に基づく正式形（外部知識OK）

### 3. 精度トレードオフ

- 誤認識検出は **false positive（誤検出）のコストが高い**
  - 正しい語を誤りと判定 → ユーザーが誤って修正する危険
  - 従って `confidence < 0.65` は返さない
- 固有名詞検出は **見逃しのコストが高い**
  - 見逃しはユーザーが手動で追加できる
  - 従って `confidence >= 0.5` から返す

---

## キャッシュ設計

| キー | 値 |
|------|----|
| `speech_proofread_cache_v2` (localStorage) | `{ [djb2hash]: TranscriptionProofreadResult }` |
| 上限 | 20エントリ（超過時は古いものから削除） |
| 無効化 | 手動「再分析」ボタン（`forceRefresh=true`） |

### キャッシュヒット時の動作

- APIを呼ばずに即座にキャッシュ結果を表示
- `detectedContext` もキャッシュに含まれるため自動コンテキストも保持される

---

## UI仕様

### 誤認識セクション（issues）

スクリーニング完了後、`issues.length > 0` の場合のみ表示。

```
⚠ 音声認識の誤り候補  [1件]
┌──────────────────────────────────────┐
│ カミトミ  →  カメ止め               │
│ 映画「カメ止め（カメラを止めるな！）」│
│ の誤認識と推定（確信度 88%）         │
│                    [修正] [無視]     │
└──────────────────────────────────────┘
```

- **[修正]**: テキスト内の `original` を `suggestion` で置換してユーザーに提示（実際のテキストは変更しない。コピー用として別途表示）
- **[無視]**: issueを非表示にする（永続化しない）

### 自動検出コンテキスト表示

「分析コンテキスト」セクションに:
```
▸ 分析コンテキスト（任意）  ✦ 自動検出済み
```
と表示。展開すると自動検出された内容が読み取り専用で確認でき、
上書き入力フォームも表示する。

### ハイライトの色分け（信頼度別）

| 確信度 | 背景色 | ボーダー | 意味 |
|--------|--------|---------|------|
| >= 0.75 | 黄色系 `rgba(250,204,21,0.38)` | `#facc15` | 高確信 |
| 0.6〜0.75 | オレンジ系 `rgba(245,158,11,0.32)` | `#f59e0b` | 中確信 |
| < 0.6 | 赤系 `rgba(239,68,68,0.28)` | `#ef4444` | 低確信・要確認 |

---

## API仕様

### エンドポイント

`POST /api/transcription-proofread`

### リクエスト

```typescript
{
  text: string;           // 書き起こしテキスト
  language: 'ja' | 'en';
  globalNouns: {          // 登録済み固有名詞（既知リスト）
    term: string;
    reading?: string;
    category: string;
  }[];
  apiKey: string;         // Gemini API Key
  model?: string;         // デフォルト: gemini-2.5-flash
  context?: string;       // 手動 or 前回のdetectedContext
}
```

### レスポンス

```typescript
{
  success: boolean;
  detectedContext?: string;  // 自動検出コンテキスト（次回呼び出し時に渡す）
  issues: TranscriptionProofreadIssue[];
  detectedNouns: DetectedNoun[];
  error?: string;
}
```

---

## 実装ファイル一覧

| ファイル | 役割 |
|---------|------|
| `app/api/transcription-proofread/route.ts` | Gemini API呼び出し・プロンプト生成 |
| `lib/types.ts` | `TranscriptionIssueType`・`TranscriptionProofreadResult`型定義 |
| `components/TranscriptionResult.tsx` | issues表示UI・自動コンテキスト表示 |
| `components/HighlightedTranscriptionText.tsx` | テキストハイライト（正規化差分表示） |
| `app/page.tsx` | `autoContext`の保持・APIへの受け渡し |
