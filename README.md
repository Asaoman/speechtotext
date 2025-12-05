# Speech to Text - React/Next.js版

AI搭載の音声文字起こし・校正アプリケーション。Vercelでホスティング可能なReact（Next.js）ベースの実装です。

## 機能

### 🎙️ 文字起こし
- **WhisperX (ローカル)**: APIキー不要・オフラインで高速動作
- **OpenAI Whisper API**: クラウドベース・高精度な音声認識
- **ElevenLabs Scribe**: 話者識別対応の文字起こし
- 対応フォーマット: MP3, WAV, M4A, MP4, FLAC, OGG, WebM
- 最大ファイルサイズ: **300MB**

### ✏️ 校正
- **Claude 3.5 Sonnet**: Anthropic製AI校正
- **OpenAI GPT-4o**: OpenAI製AI校正
- 誤字脱字・文法エラー・不自然な表現を自動修正
- 修正箇所と理由を詳細表示

### 📚 固有名詞管理
- 固有名詞の登録・編集・削除
- カテゴリ別管理
- インポート/エクスポート機能

### 🎭 映画字幕翻訳機能（新機能）
- **プロレベルの字幕翻訳**: 配信サービス・劇場公開レベルの高品質な字幕生成
- **キャラクター別翻訳**: 各キャラクターの個性・話し方を徹底的に反映した翻訳
- **包括的ペルソナ抽出**: 脚本からキャラクターの性格・背景・話し方の特徴を自動抽出
- **話者マッピング自動化**: 音声データと脚本データを総合的に分析して話者IDとキャラクターを自動マッピング
- **脚本分析**: PDF/テキスト形式の脚本をアップロードして、作品設定・キャラクター情報を自動抽出
- **音声書き起こし統合**: ElevenLabs Scribe APIを使用した高精度な話者分離
- **字幕タイミング検証**: Netflix等の業界標準に準拠したタイミングルールの検証
- **固有名詞抽出**: Gemini APIを使用した自動固有名詞抽出と管理
- **プラットフォーム別プリセット**: Netflix、U-NEXT、劇場公開、NHK、YouTube等のプリセット対応
- **データ永続化**: PostgreSQL/SQLiteによる履歴管理とプロジェクト管理

### ⬇️ ダウンロード
- テキスト (.txt)
- JSON (完全なメタデータ)
- SRT字幕
- WebVTT字幕
- SRT字幕（話者タグ付き）

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS + グラスモーフィズムデザイン
- **ホスティング**: Vercel
- **音声処理**:
  - WhisperX (ローカル処理)
  - OpenAI API
  - ElevenLabs API
- **AI校正**:
  - Anthropic Claude API
  - OpenAI GPT-4o API
- **AI翻訳・分析**:
  - Google Gemini API (gemini-2.5-flash-lite)
- **データベース**:
  - Prisma ORM
  - SQLite (ローカル開発)
  - PostgreSQL (本番環境)

## セットアップ

### 1. リポジトリのクローン

\`\`\`bash
git clone <repository-url>
cd speech-to-text-react
\`\`\`

### 2. 依存関係のインストール

\`\`\`bash
npm install
\`\`\`

### 3. 環境変数の設定

\`env.example.txt\` を \`.env.local\` にコピーして、設定を編集します：

\`\`\`bash
# Windows
copy env.example.txt .env.local

# Mac/Linux
cp env.example.txt .env.local
\`\`\`

\`.env.local\` を編集：

\`\`\`env
# データベース設定（下記「データベース設定」参照）
DATABASE_URL="file:./prisma/dev.db"

# AIサービスのAPIキー
OPENAI_API_KEY=your_openai_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
\`\`\`

### 4. データベースのセットアップ

#### ローカル開発（SQLite - 推奨）

SQLiteはインストール不要でファイルベースで動作します。

\`\`\`bash
# データベースのセットアップ
npm run db:setup
\`\`\`

これで \`prisma/dev.db\` にローカルデータベースが作成されます。

#### 本番環境（PostgreSQL）

本番環境では無料のPostgreSQLサービスを利用できます：

| サービス | 無料枠 | 特徴 |
|---------|-------|------|
| **Neon** | 0.5GB | Serverless, 自動スケール, **推奨** |
| **Supabase** | 500MB | Auth/Storage付き, 多機能 |
| **Vercel Postgres** | 256MB | Vercelと親和性高い |

**Neon（推奨）のセットアップ手順：**

1. https://neon.tech にアクセス
2. GitHub/Googleでサインアップ（無料）
3. 「Create Project」でプロジェクト作成
4. Connection stringをコピー
5. \`.env.local\` に設定：
   \`\`\`env
   DATABASE_URL="postgresql://username:password@host.neon.tech/neondb?sslmode=require"
   \`\`\`
6. PostgreSQL用スキーマに切り替え：
   \`\`\`bash
   npm run db:use-postgres
   npm run db:setup
   \`\`\`

### 5. 開発サーバーの起動

\`\`\`bash
npm run dev
\`\`\`

ブラウザで http://localhost:3020 を開きます。

---

## 🍎 Macでの開発

このプロジェクトは**Mac、Windows、Linux**で動作します。

### Macでのセットアップ

1. **Node.jsのインストール**
   - Node.js 20以上が必要です
   - [nodejs.org](https://nodejs.org/)からインストール、またはHomebrewで：
     \`\`\`bash
     brew install node
     \`\`\`

2. **Python環境（WhisperX使用時のみ）**
   - WhisperXのローカル処理を使用する場合、Python 3.8以上が必要です
   - Homebrewでインストール：
     \`\`\`bash
     brew install python
     \`\`\`
   - WhisperXを使用しない場合は、OpenAI Whisper APIまたはElevenLabs Scribe APIを使用できます

3. **データベース切り替えコマンド**
   - Windows/Mac/Linuxで同じコマンドが使用できます：
     \`\`\`bash
     npm run db:use-sqlite    # SQLiteに切り替え
     npm run db:use-postgres  # PostgreSQLに切り替え
     \`\`\`

### 注意事項

- **WhisperX**: Macでも動作しますが、Python環境と必要なライブラリ（whisperx、torch等）のインストールが必要です
- **ファイルパス**: すべてのファイルパスはクロスプラットフォーム対応です
- **データベース**: SQLiteはMacでも問題なく動作します

---

## データベースコマンド一覧

| コマンド | 説明 |
|---------|------|
| \`npm run db:setup\` | Prisma生成 + スキーマ適用 |
| \`npm run db:push\` | スキーマをDBに反映 |
| \`npm run db:studio\` | Prisma Studio（GUI）を起動 |
| \`npm run db:reset\` | DBをリセット（データ削除） |
| \`npm run db:use-sqlite\` | SQLiteスキーマに切り替え |
| \`npm run db:use-postgres\` | PostgreSQLスキーマに切り替え |

## Vercelへのデプロイ

### 方法1: Vercel CLIを使用

\`\`\`bash
# Vercel CLIのインストール（初回のみ）
npm install -g vercel

# デプロイ
vercel
\`\`\`

### 方法2: GitHubと連携

1. GitHubにリポジトリをプッシュ
2. [Vercel](https://vercel.com/)にログイン
3. 「New Project」をクリック
4. GitHubリポジトリをインポート
5. 環境変数を設定：
   - \`OPENAI_API_KEY\`
   - \`ELEVENLABS_API_KEY\`
   - \`ANTHROPIC_API_KEY\`
6. 「Deploy」をクリック

### 環境変数の設定（Vercel Dashboard）

Vercelダッシュボード → Settings → Environment Variables で以下を設定：

- \`OPENAI_API_KEY\`: OpenAI APIキー
- \`ELEVENLABS_API_KEY\`: ElevenLabs APIキー
- \`ANTHROPIC_API_KEY\`: Anthropic APIキー

## プロジェクト構造

\`\`\`
speech-to-text-react/
├── app/
│   ├── api/
│   │   ├── transcribe/              # 文字起こしAPI
│   │   ├── proofread/                # 校正API
│   │   ├── translate/               # 翻訳API（キャラクター対応）
│   │   ├── translate-batch/         # バッチ翻訳API
│   │   ├── analyze-script/           # 脚本分析API
│   │   ├── extract-persona/         # ペルソナ抽出API
│   │   ├── auto-map-speakers/        # 話者マッピング自動化API
│   │   ├── identify-characters/     # キャラクター識別API
│   │   ├── extract-proper-nouns/    # 固有名詞抽出API
│   │   ├── parse-pdf/                # PDF解析API
│   │   ├── projects/                 # プロジェクト管理API
│   │   ├── transcriptions/           # 書き起こし履歴API
│   │   ├── proofreading-results/     # 校正結果API
│   │   ├── subtitle-sessions/        # 字幕セッションAPI
│   │   ├── movie-projects/           # 映画プロジェクトAPI
│   │   ├── characters/               # キャラクター管理API
│   │   ├── env-keys/                 # 環境変数取得API
│   │   └── migrate/                  # データマイグレーションAPI
│   ├── globals.css                    # グローバルスタイル
│   ├── layout.tsx                     # レイアウト
│   └── page.tsx                       # メインページ
├── components/
│   ├── FileUpload.tsx                 # ファイルアップロード
│   ├── SettingsModal.tsx               # 設定モーダル
│   ├── TranscriptionResult.tsx         # 文字起こし結果表示
│   ├── ProofreadingSection.tsx         # 校正セクション
│   ├── ProperNounsManager.tsx          # 固有名詞管理
│   ├── MovieSubtitleTab.tsx            # 映画字幕タブ（メイン）
│   ├── CharacterManager.tsx            # キャラクター管理
│   ├── MovieSettings.tsx               # 作品設定
│   ├── TranslationEditor.tsx           # 翻訳エディタ
│   ├── SpeakerMapping.tsx              # 話者マッピング
│   ├── SubtitleTimingValidator.tsx     # タイミング検証
│   ├── ProperNounExtractor.tsx         # 固有名詞抽出
│   ├── DialogueList.tsx                # セリフ一覧
│   ├── CharacterPanel.tsx              # キャラクターパネル
│   └── HistorySidebar.tsx              # 履歴サイドバー
├── lib/
│   ├── types.ts                        # 型定義
│   ├── utils.ts                        # ユーティリティ関数
│   ├── subtitlePresets.ts             # 字幕プリセット定義
│   └── prisma.ts                       # Prismaクライアント
├── prisma/
│   ├── schema.prisma                   # SQLiteスキーマ
│   ├── schema.postgresql.prisma        # PostgreSQLスキーマ
│   └── dev.db                          # SQLiteデータベース
├── scripts/
│   └── whisperx_transcribe.py         # WhisperXスクリプト
├── public/                             # 静的ファイル
├── env.example.txt                      # 環境変数サンプル
├── prisma.config.ts                    # Prisma設定
├── next.config.js                       # Next.js設定
├── tailwind.config.ts                  # Tailwind設定
├── tsconfig.json                        # TypeScript設定
├── vercel.json                          # Vercel設定
└── package.json                         # 依存関係
\`\`\`

## 使い方

### 1. APIキーの設定

初回起動時に右上の「⚙️ 設定」ボタンから各種APIキーを入力してください。
APIキーはブラウザのlocalStorageに保存されます。

### 2. 音声ファイルのアップロード

1. 「文字起こしモデルを選択」で以下から選択：
   - **WhisperX (ローカル)**: APIキー不要・高速・オフライン動作
   - **OpenAI Whisper**: 高精度・クラウドベース
   - **ElevenLabs Scribe**: 話者識別対応
2. 音声ファイルをアップロード（最大300MB）
3. 「🚀 テキスト変換を開始」をクリック

### 3. 結果のダウンロード

文字起こし完了後、以下の形式でダウンロード可能：
- テキスト (.txt)
- JSON (完全なメタデータ)
- SRT字幕（セグメント情報がある場合）
- WebVTT字幕（セグメント情報がある場合）

### 4. 校正

文字起こし結果を校正する場合：
1. 校正AIを選択（ClaudeまたはGPT-4o）
2. 言語を選択
3. 「🚀 校正を開始」をクリック

### 5. 固有名詞管理

よく使う固有名詞を登録しておくと、校正時に参照されます。

### 6. 映画字幕翻訳機能

#### 6.1 基本的な使い方

1. **プロジェクトの作成**
   - メインページで「プロジェクトを選択または作成」からプロジェクトを作成

2. **脚本のアップロード**
   - 「映画字幕」タブを開く
   - 「脚本」ボタンからPDFまたはテキストファイルをアップロード
   - 自動的に作品設定とキャラクター情報が抽出されます

3. **音声ファイルのアップロード**
   - 「音声」ボタンからMP3等の音声ファイルをアップロード
   - ElevenLabs Scribe APIで話者分離付きの書き起こしが実行されます
   - 脚本が存在する場合、自動的に話者マッピングが実行されます

4. **SRTファイルのアップロード**
   - 「SRT」ボタンから既存のSRTファイルをアップロード
   - 話者タグが含まれている場合は自動的に認識されます

5. **キャラクターの設定**
   - 「キャラクター」タブで各キャラクターの詳細情報を設定
   - ペルソナ情報（性格、背景、話し方の特徴等）を入力
   - コメディ作品の場合はギャグレベルやローカル性も設定可能

6. **翻訳の実行**
   - 「翻訳エディタ」タブで翻訳を実行
   - キャラクター別の個性を反映した翻訳が自動生成されます
   - バッチ翻訳機能で一括処理も可能

7. **タイミング検証**
   - 「タイミング検証」タブでNetflix等の業界標準に準拠しているか検証
   - 違反があれば自動修正機能も利用可能

8. **エクスポート**
   - 「エクスポート」ボタンからSRT/VTT形式でダウンロード
   - 話者タグ付きSRTも生成可能

#### 6.2 話者マッピング自動化

- 音声データと脚本データを総合的に分析して、話者IDとキャラクターを自動マッピング
- 確信度が高い（0.8以上）マッピングは自動適用
- 確信度が中程度（0.5-0.8）のマッピングは確認UIを表示
- 手動修正も可能

#### 6.3 キャラクター個性の反映

- 脚本から包括的なペルソナ情報を自動抽出
- 性格、背景、話し方の特徴、コメディ要素等を詳細に分析
- 翻訳時にキャラクターの個性を最大限に反映

#### 6.4 プラットフォーム別プリセット

以下のプラットフォーム向けのプリセットが利用可能：
- Netflix（日本語・英語）
- U-NEXT（日本語）
- Amazon Prime Video（日本語）
- 劇場公開（日本語）
- NHK（日本語）
- 民放テレビ（日本語）
- YouTube/Web（日本語・英語）

各プリセットには以下の設定が含まれます：
- 文字数制限
- 行数制限
- CPS（文字/秒）制限
- タイミングルール（最小/最大表示時間、ギャップ制限等）

## 注意事項

- **ファイルサイズ制限**: 最大300MB
- **API料金**: OpenAI・ElevenLabs APIの使用には料金が発生します（WhisperXは無料）
- **WhisperX要件**: ローカルモードにはPython環境とWhisperXのインストールが必要です
- **データ保存**: 固有名詞データは現在メモリ上に保存されます（本番環境ではデータベースの使用を推奨）

## 実装済み機能

- [x] Vercel PostgresまたはKVによる固有名詞の永続化 → SQLite/PostgreSQL対応完了
- [x] 文字起こし履歴の保存 → 実装完了
- [x] 映画字幕翻訳機能 → 実装完了
- [x] キャラクター別翻訳機能 → 実装完了
- [x] 話者マッピング自動化 → 実装完了
- [x] 脚本分析機能 → 実装完了
- [x] ペルソナ抽出機能 → 実装完了
- [x] 字幕タイミング検証機能 → 実装完了
- [x] プラットフォーム別プリセット → 実装完了
- [x] データベース機能（Prisma + SQLite/PostgreSQL） → 実装完了

## 今後の改善予定

- [ ] ユーザー認証機能
- [ ] バッチ処理機能の拡張
- [ ] リアルタイム文字起こし
- [ ] 複数言語対応の拡張
- [ ] 字幕エディタのUI改善

## ライセンス

MIT

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
