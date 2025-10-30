# Speech to Text App - 現状の実装要件仕様書

## 📋 概要

**アプリケーション名**: Speech to Text
**フレームワーク**: Next.js 16 (App Router) + TypeScript
**スタイリング**: Tailwind CSS + インラインスタイル（グラスモーフィズムデザイン）
**主要機能**: 音声文字起こし → AI校正 → 字幕生成の3ステップワークフロー

---

## 🎯 主要機能

### 1. 📝 書き起こし（Transcription Tab）
**目的**: 音声ファイルをテキストに変換

#### 対応サービス
- **WhisperX** (ローカル): APIキー不要、ローカル処理
- **OpenAI Whisper API**: クラウドベース、高精度
- **ElevenLabs Scribe**: 話者識別対応

#### 機能詳細
- ファイルアップロード（最大300MB）
- 対応フォーマット: MP3, WAV, M4A, MP4, FLAC, OGG, WebM
- 結果出力:
  - テキスト（必須）
  - セグメント情報（開始/終了時間、話者情報）
  - ワードレベルタイムスタンプ
  - 言語検出

#### ダウンロード形式
- TXT: プレーンテキスト
- JSON: 完全なメタデータ
- SRT: 字幕ファイル（セグメント情報がある場合）
- VTT: WebVTT字幕（セグメント情報がある場合）

---

### 2. ✏️ 校正（Proofreading Tab）
**目的**: 文字起こし結果をAIで校正

#### AI サービス
- **OpenAI GPT**: モデル選択可能（gpt-4o-mini推奨）
- **Claude**: モデル選択可能（claude-3-5-sonnet推奨）
- **Google Gemini**: モデル選択可能（gemini-1.5-flash推奨、最安）

#### 機能詳細

##### テキスト入力
- 書き起こしタブからの自動入力
- ファイルアップロード（SRT, TXT, MD）
- 直接入力

##### プロジェクト設定
- **プロジェクト選択**: 複数プロジェクトの管理
- **プロジェクト作成**: 新規プロジェクトの作成
- **AI校正用コンテキスト**: プロジェクトごとのカスタム指示
  - 自動保存（500ms debounce）
  - 例: 「です・ます調で統一」「専門用語はそのまま」

##### 固有名詞辞書
- プロジェクトごとに管理
- 固有名詞の登録・編集・削除
- 校正時に自動参照

##### 校正設定
- 言語選択: 日本語/英語
- AIサービス: 設定画面で選択したデフォルトサービスを使用（変更不可）
- 固有名詞参照: 常に有効

##### 校正結果
- **校正後テキスト**: 修正済みテキスト
- **修正箇所**:
  - 修正前/修正後の比較
  - 修正理由
  - 修正タイプ
- **追加提案**: AIからの改善提案

---

### 3. 🎬 字幕生成（Subtitle Generation Tab）
**目的**: 文字起こし結果から映画フォーマットの字幕を生成

#### テキスト入力
- 書き起こしタブからの自動入力
- ファイルアップロード（SRT, TXT, MD）
- 直接入力

#### 校正機能（統合）
- テキストをAIで校正してから字幕生成可能
- 「元の文章」と「校正結果」のタブ切り替え
- 校正結果を使って字幕生成

#### プロジェクト設定（校正タブと同じ）
- プロジェクト選択・作成
- AI校正用コンテキスト
- 固有名詞辞書管理

#### 字幕生成設定
- **言語**: 日本語/英語
- **最大文字数/行**:
  - 英語: 20-60文字（推奨42）
  - 日本語: 5-20文字（推奨13）
- **最大行数**: 1-3行（推奨2行）
- **改行最適化**: デフォルトAIサービスを使用

#### タイムスタンプ生成
- **リアルタイムスタンプがある場合**: ワードレベルのタイムスタンプを使用
- **セグメント情報のみの場合**: セグメントから疑似ワードを生成
- **テキストのみの場合**: 疑似タイムスタンプを生成

#### 字幕編集機能
- **タイムライン表示**: 100ms単位のビジュアルタイムライン
- **個別編集**:
  - 開始/終了時間の調整（±100ms）
  - テキスト編集（複数行対応）
  - 字幕の削除
- **検証機能**:
  - 行ごとの文字数チェック
  - 最大行数チェック
  - 超過時の警告表示

#### ダウンロード
- SRT形式
- VTT形式

---

## 🗂️ データ管理

### プロジェクト（Project）
```typescript
interface Project {
  id: string              // 例: "project_1234567890"
  name: string            // プロジェクト名
  customContext: string   // AI校正用コンテキスト
  created_at: string
  updated_at: string
}
```

**保存場所**: localStorage (`projects`)
**現在のプロジェクトID**: localStorage (`current_project_id`)

### 固有名詞辞書（Dictionary）
```typescript
interface Dictionary {
  id: string              // プロジェクトIDと同じ
  name: string            // プロジェクト名と同じ
  created_at: string
  updated_at: string
}

interface DictionaryEntry {
  id: string              // 例: "entry_1234567890"
  term: string            // 固有名詞
  reading: string         // 読み方
  dictionaryId: string    // 所属辞書ID
}
```

**保存場所**:
- 辞書: localStorage (`dictionaries`)
- エントリ: localStorage (`dictionary_entries_${dictionaryId}`)

---

## ⚙️ 設定管理

### API Keys（localStorage: `api_keys`）
```typescript
interface ApiKeys {
  openai?: string        // OpenAI API Key
  elevenlabs?: string    // ElevenLabs API Key
  claude?: string        // Claude API Key
  gemini?: string        // Google Gemini API Key
}
```

### AI Preferences（localStorage: `ai_preferences`）
```typescript
interface AIPreferences {
  defaultService: 'openai' | 'claude' | 'gemini'  // デフォルトAIサービス
  openaiModel: string    // 例: "gpt-4o-mini"
  claudeModel: string    // 例: "claude-3-5-sonnet-20241022"
  geminiModel: string    // 例: "gemini-1.5-flash"
}
```

**デフォルト値**:
- Service: `gemini`（最もコスパが良い）
- OpenAI Model: `gpt-4o-mini`
- Claude Model: `claude-3-5-sonnet-20241022`
- Gemini Model: `gemini-1.5-flash`

### Subtitle Settings（localStorage: `subtitle_settings`）
```typescript
interface SubtitleSettings {
  currentLanguage: 'en' | 'ja'
  en: {
    maxCharsPerLine: number  // デフォルト: 42
    maxLines: number         // デフォルト: 2
  }
  ja: {
    maxCharsPerLine: number  // デフォルト: 13
    maxLines: number         // デフォルト: 2
  }
  lineBreakService: 'chatgpt' | 'claude' | 'gemini'
}
```

---

## 🎨 コンポーネント構成

### ページレベル（`app/page.tsx`）
**役割**: 全体の状態管理とタブ切り替え

**主要State**:
- `activeTab`: 現在のタブ
- `transcriptionResult`: 文字起こし結果
- `proofreadingResult`: 校正結果
- `apiKeys`: API設定
- `subtitleSettings`: 字幕設定
- `aiPreferences`: AI設定

### コンポーネント一覧

#### 1. `FileUpload.tsx`
- 音声ファイルのアップロードUI
- サービス選択（WhisperX / OpenAI / ElevenLabs）
- API呼び出し（`/api/transcribe`）

#### 2. `TranscriptionResult.tsx`
- 文字起こし結果の表示
- ダウンロードボタン（TXT, JSON, SRT, VTT）
- 「校正を開始」「字幕を生成」ボタン

#### 3. `ProofreadingSection.tsx`
- テキスト入力（タブ切り替え: 元の文章/校正結果）
- ファイルアップロード（SRT/TXT/MD）
- プロジェクト管理UI
- AI校正用コンテキスト入力
- 固有名詞辞書管理ボタン
- 校正実行と結果表示

#### 4. `SubtitleGenerator.tsx`
- テキスト入力（タブ切り替え: 元の文章/校正結果）
- ファイルアップロード（SRT/TXT/MD）
- 校正機能（統合）
- プロジェクト管理UI
- 字幕生成設定
- 字幕編集UI（タイムライン + 個別編集）
- ダウンロードボタン

#### 5. `ProperNounsManager.tsx`
- 固有名詞辞書の完全な管理UI
- プロジェクト選択・作成・削除
- AI校正用コンテキスト編集
- 固有名詞の追加・編集・削除
- 検索・フィルタリング
- エクスポート機能

#### 6. `ProperNounsModalMinimal.tsx`
- ミニマルな固有名詞管理モーダル
- ProofreadingSection / SubtitleGenerator から呼び出される
- 基本的な固有名詞の追加・編集・削除機能

#### 7. `SettingsModal.tsx`
- APIキー設定
- デフォルトAIサービス・モデル選択
- 字幕生成設定（言語別）

---

## 🔄 ワークフロー

### 標準フロー
```
1. 書き起こしタブ
   ↓ ファイルアップロード → 文字起こし実行

2. 校正タブ（オプション）
   ↓ プロジェクト選択 → 固有名詞登録 → 校正実行

3. 字幕生成タブ
   ↓ 校正（オプション） → 字幕生成 → 編集 → ダウンロード
```

### タブ間の連携
- **書き起こし → 校正**: テキストを自動入力
- **書き起こし → 字幕生成**: テキストとタイムスタンプ情報を渡す
- **校正 → 字幕生成**: 直接的な連携なし（同じプロジェクト設定を共有）

---

## ⚠️ 現状の課題

### 1. **コンポーネントの重複**
- プロジェクト管理UIが `ProofreadingSection` と `SubtitleGenerator` に重複実装
- 固有名詞管理が `ProperNounsManager` と `ProperNounsModalMinimal` の2つに分離

### 2. **状態管理の複雑さ**
- page.tsxに状態が集中
- 各コンポーネントが独自にlocalStorageを直接操作

### 3. **一貫性の欠如**
- プロジェクト管理のUIが校正タブと字幕生成タブで若干異なる
- 固有名詞管理のアクセス方法が異なる

### 4. **データ構造の不一致**
- Projectとは別にDictionaryが存在（ほぼ同じ構造）
- ProjectとDictionaryは同じIDを使用しているが、データは別々に保存

---

## 🎯 改善提案

### 短期的改善
1. **プロジェクト管理コンポーネントの統一**
   - `ProjectSelector` コンポーネントを作成
   - 校正タブと字幕生成タブで共通使用

2. **固有名詞管理の統一**
   - `ProperNounsModalMinimal` に機能を集約
   - `ProperNounsManager` を削除または別用途に

3. **カスタムHookの作成**
   - `useProject()`: プロジェクト管理
   - `useProperNouns()`: 固有名詞管理
   - `useSettings()`: 設定管理

### 長期的改善
1. **データベース導入**
   - Vercel Postgres/KVへの移行
   - ユーザー認証の追加

2. **状態管理ライブラリ**
   - Zustand/Jotai等の導入
   - グローバル状態の整理

3. **API統合**
   - プロジェクト管理API
   - 固有名詞管理API

---

## 📊 業界標準仕様（字幕）

### 英語字幕（Netflix/BBC基準）
- 最大42文字/行（1行のみの場合37文字推奨）
- 最大2行（画面占有率20%以下）
- 読み取り速度: 20 CPS（大人）/ 17 CPS（子供）
- 最小表示時間: 0.833秒（20フレーム@24fps）
- 最大表示時間: 7秒
- 最小間隔: 0.083秒（2フレーム@24fps）
- 改行ルール: 句読点の後/接続詞・前置詞の前/冠詞の後は避ける
- 形状: ピラミッド型（下辺が長い）

### 日本語字幕
- 最大13文字/行（全角）
- 最大2行
- 読み取り速度: 4文字/秒（全角）
- 最小表示時間: 1秒
- 最大表示時間: 7秒
- 改行ルール: 文節で区切る/助詞から始めない
- 句読点: 適切な「。」「、」の使用

---

## 🔑 技術的詳細

### API Routes
- `/api/transcribe`: 文字起こし（OpenAI/ElevenLabs/WhisperX）
- `/api/proofread`: AI校正
- `/api/subtitles/generate`: 字幕生成
- `/api/subtitles/optimize-line-breaks`: 改行最適化
- `/api/proper-nouns`: 固有名詞CRUD
- `/api/proper-nouns/categories`: カテゴリ一覧
- `/api/dictionaries`: 辞書CRUD

### Type Definitions（主要型）
詳細は `lib/types.ts` 参照
```typescript
TranscriptionResult
ProofreadingResult
SubtitleEntry
SubtitleGenerationResult
Project
Dictionary
DictionaryEntry
ApiKeys
AIPreferences
SubtitleSettings
```

### Utils（`lib/utils.ts`）
- `storage`: localStorage操作ヘルパー
- `downloadFile`: ファイルダウンロード
- `generateSRT/generateVTT`: 字幕ファイル生成
- `formatTimestamp`: タイムスタンプフォーマット
