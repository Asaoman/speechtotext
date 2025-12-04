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

### ⬇️ ダウンロード
- テキスト (.txt)
- JSON (完全なメタデータ)
- SRT字幕
- WebVTT字幕

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

ブラウザで http://localhost:3000 を開きます。

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
│   │   ├── transcribe/       # 文字起こしAPI
│   │   ├── proofread/         # 校正API
│   │   └── proper-nouns/      # 固有名詞管理API
│   ├── globals.css            # グローバルスタイル
│   ├── layout.tsx             # レイアウト
│   └── page.tsx               # メインページ
├── components/
│   ├── FileUpload.tsx         # ファイルアップロード
│   ├── SettingsModal.tsx      # 設定モーダル
│   ├── TranscriptionResult.tsx # 文字起こし結果表示
│   ├── ProofreadingSection.tsx # 校正セクション
│   └── ProperNounsManager.tsx  # 固有名詞管理
├── lib/
│   ├── types.ts               # 型定義
│   └── utils.ts               # ユーティリティ関数
├── scripts/
│   └── whisperx_transcribe.py # WhisperXスクリプト
├── public/                    # 静的ファイル
├── .env.example               # 環境変数サンプル
├── next.config.js             # Next.js設定
├── tailwind.config.ts         # Tailwind設定
├── tsconfig.json              # TypeScript設定
├── vercel.json                # Vercel設定
└── package.json               # 依存関係
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

## 注意事項

- **ファイルサイズ制限**: 最大300MB
- **API料金**: OpenAI・ElevenLabs APIの使用には料金が発生します（WhisperXは無料）
- **WhisperX要件**: ローカルモードにはPython環境とWhisperXのインストールが必要です
- **データ保存**: 固有名詞データは現在メモリ上に保存されます（本番環境ではデータベースの使用を推奨）

## 今後の改善予定

- [x] ~~Vercel PostgresまたはKVによる固有名詞の永続化~~ → SQLite/PostgreSQL対応完了
- [x] ~~文字起こし履歴の保存~~ → 実装完了
- [ ] ユーザー認証機能
- [ ] バッチ処理機能
- [ ] リアルタイム文字起こし

## ライセンス

MIT

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
