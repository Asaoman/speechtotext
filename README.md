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

\`.env.example\` を \`.env.local\` にコピーして、APIキーを設定します：

\`\`\`bash
cp .env.example .env.local
\`\`\`

\`.env.local\` を編集：

\`\`\`env
OPENAI_API_KEY=your_openai_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
\`\`\`

### 4. 開発サーバーの起動

\`\`\`bash
npm run dev
\`\`\`

ブラウザで http://localhost:3000 を開きます。

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

- [ ] Vercel PostgresまたはKVによる固有名詞の永続化
- [ ] ユーザー認証機能
- [ ] 文字起こし履歴の保存
- [ ] バッチ処理機能
- [ ] リアルタイム文字起こし

## ライセンス

MIT

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
