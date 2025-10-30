# 校正・字幕生成コンポーネント詳細仕様書

## 📋 概要

このドキュメントでは、Speech to Text Appの**校正機能**と**字幕生成機能**のコンポーネント構造、データフロー、UI構成を詳細に記述します。

---

## 🏗️ アーキテクチャ概要

### コンポーネント階層
```
app/page.tsx (親)
├── ProofreadingSection (校正タブ)
│   ├── テキスト入力エリア
│   ├── プロジェクト管理セクション
│   ├── 固有名詞管理ボタン
│   └── ProperNounsModalMinimal (モーダル)
│
└── SubtitleGenerator (字幕生成タブ)
    ├── テキスト入力エリア
    ├── 校正機能（統合）
    ├── プロジェクト管理セクション
    ├── 字幕生成設定
    ├── 字幕編集UI
    └── ProperNounsModalMinimal (モーダル)
```

### データフロー
```
localStorage
    ├── projects (プロジェクト一覧)
    ├── current_project_id (現在のプロジェクトID)
    ├── dictionaries (辞書一覧)
    ├── dictionary_entries_${id} (辞書エントリ)
    ├── api_keys (APIキー)
    ├── ai_preferences (AI設定)
    └── subtitle_settings (字幕設定)
         ↓
    app/page.tsx
         ↓
    ProofreadingSection / SubtitleGenerator
         ↓
    API Routes (/api/proofread, /api/subtitles/generate)
         ↓
    AI Services (OpenAI / Claude / Gemini)
```

---

## ✏️ 校正機能（ProofreadingSection.tsx）

### 1. コンポーネント構造

#### Props
```typescript
interface ProofreadingSectionProps {
  transcriptionResult?: TranscriptionResult | null  // 書き起こし結果（オプション）
  apiKeys: ApiKeys                                   // APIキー
  aiPreferences: AIPreferences                       // AI設定
  proofreadingResult: ProofreadingResult | null      // 校正結果
  setProofreadingResult: (result: ProofreadingResult | null) => void
  navigatedFromTranscription?: boolean               // 書き起こしから遷移したか
}
```

#### State
```typescript
// AI設定（変更不可、設定画面から取得）
const service = aiPreferences.defaultService  // 'openai' | 'claude' | 'gemini'
const model = // aiPreferencesから取得したモデル名
const includeProperNouns = true  // 常に固有名詞を参照

// ローカルState
const [language, setLanguage] = useState<'ja' | 'en'>('ja')
const [customContext, setCustomContext] = useState('')
const [isProofreading, setIsProofreading] = useState(false)
const [error, setError] = useState('')
const [leftTab, setLeftTab] = useState<'original' | 'result'>('original')
const [originalText, setOriginalText] = useState(transcriptionResult?.text || '')
const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
const [fileUploadError, setFileUploadError] = useState('')
const [uploadedSegments, setUploadedSegments] = useState<any[] | null>(null)
const [showProperNounsModal, setShowProperNounsModal] = useState(false)

// プロジェクト管理
const [projects, setProjects] = useState<any[]>([])
const [selectedProjectId, setSelectedProjectId] = useState<string>('')
const [showNewProjectInput, setShowNewProjectInput] = useState(false)
const [newProjectName, setNewProjectName] = useState('')
```

### 2. UI構造

#### 2.1 テキストエディタ部分（全幅カード）
```
┌─────────────────────────────────────────────────────┐
│ 📄 テキスト                                          │
│                                                     │
│ [📝 元の文章] [✅ 校正結果]  ← タブ切り替え        │
│                                                     │
│ ┌─ 元の文章タブ ───────────────────────────────┐   │
│ │                                                 │   │
│ │ ┌─ ファイルアップロード（アコーディオン）─┐   │   │
│ │ │ 📁 ファイルからアップロード              │   │   │
│ │ │   SRT、TXT、MDファイルをアップロード可   │   │   │
│ │ │   [ファイル選択ボタン]                   │   │   │
│ │ └─────────────────────────────────────────┘   │   │
│ │                                                 │   │
│ │ 校正する文章を貼り付けてください                │   │
│ │ ┌────────────────────────────────────────┐  │   │
│ │ │                                          │  │   │
│ │ │  [テキストエリア - 20行]                │  │   │
│ │ │                                          │  │   │
│ │ └────────────────────────────────────────┘  │   │
│ │ 1,234 文字                                      │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─ 校正結果タブ ───────────────────────────────┐   │
│ │ ✅ 校正完了！(Claude - claude-3-5-sonnet)      │   │
│ │                                                 │   │
│ │ 校正後のテキスト                                │   │
│ │ ┌────────────────────────────────────────┐  │   │
│ │ │ [校正済みテキスト - 読み取り専用]         │  │   │
│ │ └────────────────────────────────────────┘  │   │
│ │                                                 │   │
│ │ [📥 TXTダウンロード]                            │   │
│ └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

#### 2.2 プロジェクト設定セクション
```
┌─────────────────────────────────────────────────────┐
│ 📁 プロジェクト設定                                  │
│                                                     │
│ 🗂️ プロジェクトを選択                              │
│ [プロジェクト選択ドロップダウン ▼] [+ 新規]         │
│ プロジェクトには、AI校正用コンテキストと...         │
│                                                     │
│ ┌─ 新規プロジェクト作成（表示/非表示）─────────┐   │
│ │ プロジェクト名                                  │   │
│ │ [テキスト入力]                                  │   │
│ │ [作成] [キャンセル]                             │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ AIサービス: Gemini  モデル: gemini-1.5-flash       │
│ ※ 設定画面から変更できます                         │
│                                                     │
│ 🌐 校正言語                                         │
│ [🇯🇵 日本語 ▼]                                      │
│                                                     │
│ 📝 AI校正用コンテキスト（任意）                     │
│ ┌────────────────────────────────────────────┐  │
│ │ [テキストエリア - 4行]                        │  │
│ │ 校正時の追加指示を入力...                     │  │
│ └────────────────────────────────────────────┘  │
│ ✓ コンテキスト設定済み                              │
│                                                     │
│ 📚 固有名詞辞書                                     │
│ [固有名詞を管理 >]                                  │
│ 固有名詞を登録すると、校正時に自動的に参照...       │
└─────────────────────────────────────────────────────┘
```

#### 2.3 校正開始ボタンとエラー表示
```
┌─────────────────────────────────────────────────────┐
│ ⚠️ OpenAI APIキーが設定されていません               │
│    右上の設定から入力してください。                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [✨ 校正を開始]  ← 全幅ボタン                        │
└─────────────────────────────────────────────────────┘
```

#### 2.4 修正箇所と提案（校正後）
```
┌─────────────────────────────────────────────────────┐
│ ▼ 修正箇所 (15件)                                    │
│ ┌───────────────────────────────────────────────┐ │
│ │ 1. [文法エラー]                                 │ │
│ │ ┌──────────┬──────────┐                      │ │
│ │ │ 修正前     │ 修正後     │                      │ │
│ │ │ である。   │ です。     │                      │ │
│ │ └──────────┴──────────┘                      │ │
│ │ 理由: 口語調に統一                              │ │
│ └───────────────────────────────────────────────┘ │
│ ... (他14件)                                         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ▼ 追加の提案 (3件)                                  │
│ ┌───────────────────────────────────────────────┐ │
│ │ 1 文章全体の流れが自然になりました              │ │
│ │ 2 専門用語の使用が適切です                      │ │
│ │ 3 読みやすさが向上しました                      │ │
│ └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 3. 主要機能

#### 3.1 テキスト入力
```typescript
// 書き起こしタブからの自動入力
useEffect(() => {
  if (transcriptionResult?.text) {
    setOriginalText(transcriptionResult.text)
  }
}, [transcriptionResult])

// ファイルアップロード
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  // SRT/TXT/MDファイルを読み込み
  // SRTの場合はパースしてセグメント情報も保存
}

// SRTパーサー
const parseSRTWithSegments = (srtContent: string): { text: string; segments: any[] } => {
  // タイムスタンプとテキストを抽出
}
```

#### 3.2 プロジェクト管理
```typescript
// プロジェクト読み込み
useEffect(() => {
  loadProjects()
}, [])

const loadProjects = () => {
  const loadedProjects = storage.getProjects()
  setProjects(loadedProjects)

  // 現在のプロジェクトを選択
  const currentId = storage.getCurrentProjectId()
  if (currentId && loadedProjects.find(p => p.id === currentId)) {
    setSelectedProjectId(currentId)
    loadProjectContext(currentId)
  }
}

// プロジェクト選択
const handleProjectSelect = (projectId: string) => {
  setSelectedProjectId(projectId)
  storage.setCurrentProjectId(projectId)
  loadProjectContext(projectId)
}

// プロジェクト作成
const handleCreateProject = () => {
  const newProject = {
    id: `project_${Date.now()}`,
    name: newProjectName.trim(),
    customContext: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  storage.saveProject(newProject)

  // 辞書も同時に作成（互換性のため）
  const newDict = {
    id: newProject.id,
    name: newProject.name,
    created_at: newProject.created_at,
    updated_at: newProject.updated_at,
  }
  storage.setDictionaries([...storage.getDictionaries(), newDict])
}

// コンテキスト自動保存（500ms debounce）
useEffect(() => {
  if (selectedProjectId && customContext !== undefined) {
    const timeoutId = setTimeout(() => {
      handleSaveProjectContext()
    }, 500)
    return () => clearTimeout(timeoutId)
  }
}, [customContext, selectedProjectId])
```

#### 3.3 校正実行
```typescript
const handleProofread = async () => {
  const apiKey = service === 'openai' ? apiKeys.openai
    : service === 'claude' ? apiKeys.claude
    : apiKeys.gemini

  if (!apiKey) {
    setError(`${service} APIキーが設定されていません`)
    return
  }

  setIsProofreading(true)
  setError('')

  try {
    const response = await fetch('/api/proofread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: originalText,
        service,
        model,
        language,
        includeProperNouns,
        customContext: customContext.trim(),
        apiKey,
      }),
    })

    const result = await response.json()
    setProofreadingResult(result)
    setLeftTab('result')
  } catch (err) {
    setError(err.message || '校正中にエラーが発生しました')
  } finally {
    setIsProofreading(false)
  }
}
```

---

## 🎬 字幕生成機能（SubtitleGenerator.tsx）

### 1. コンポーネント構造

#### Props
```typescript
interface SubtitleGeneratorProps {
  transcriptionResult?: TranscriptionResult | null  // 書き起こし結果（オプション）
  subtitleSettings: SubtitleSettings                // 字幕設定
  apiKeys: { openai?: string; claude?: string; gemini?: string }
  aiPreferences: AIPreferences                      // AI設定
  onSubtitleGenerated?: (srt: string, vtt: string) => void
  navigatedFromTranscription?: boolean              // 書き起こしから遷移したか
}
```

#### State
```typescript
// 字幕生成
const [isGenerating, setIsGenerating] = useState(false)
const [result, setResult] = useState<SubtitleGenerationResult | null>(null)
const [error, setError] = useState('')
const [editingSubtitles, setEditingSubtitles] = useState<SubtitleEntry[]>([])
const [editingIndex, setEditingIndex] = useState<number | null>(null)
const [showTimeline, setShowTimeline] = useState(false)

// テキスト入力
const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
const [fileUploadError, setFileUploadError] = useState('')
const [inputText, setInputText] = useState(transcriptionResult?.text || '')
const [leftTab, setLeftTab] = useState<'original' | 'result'>('original')

// 校正機能（統合）
const [proofreadingResult, setProofreadingResult] = useState<any>(null)
const [isProofreading, setIsProofreading] = useState(false)
const [proofreadingError, setProofreadingError] = useState('')
const [language, setLanguage] = useState<'ja' | 'en'>('ja')
const [customContext, setCustomContext] = useState('')

// プロジェクト管理
const [projects, setProjects] = useState<any[]>([])
const [selectedProjectId, setSelectedProjectId] = useState<string>('')
const [showNewProjectInput, setShowNewProjectInput] = useState(false)
const [newProjectName, setNewProjectName] = useState('')
const [showProperNounsModal, setShowProperNounsModal] = useState(false)

// ローカル字幕設定（字幕生成時に使用）
const [localLanguage, setLocalLanguage] = useState<'en' | 'ja'>(subtitleSettings.currentLanguage)
const [localMaxCharsPerLine, setLocalMaxCharsPerLine] = useState(subtitleSettings[subtitleSettings.currentLanguage].maxCharsPerLine)
const [localMaxLines, setLocalMaxLines] = useState(subtitleSettings[subtitleSettings.currentLanguage].maxLines)
```

### 2. UI構造

#### 2.1 テキストセクション
```
┌─────────────────────────────────────────────────────┐
│ 📄 テキスト                 [📝 元の文章] [✅ 校正結果] │
│                                                     │
│ ┌─ 元の文章タブ ───────────────────────────────┐   │
│ │                                                 │   │
│ │ ┌─ ファイルアップロード（アコーディオン）─┐   │   │
│ │ │ 📁 ファイルからアップロード              │   │   │
│ │ │   SRT、TXT、MDファイルをアップロード     │   │   │
│ │ └─────────────────────────────────────────┘   │   │
│ │                                                 │   │
│ │ テキストを入力                                  │   │
│ │ ┌────────────────────────────────────────┐  │   │
│ │ │ [テキストエリア - 12行]                  │  │   │
│ │ └────────────────────────────────────────┘  │   │
│ │                                                 │   │
│ │ ┌─ 校正設定 ─────────────────────────┐      │   │
│ │ │ 言語: [🇯🇵 日本語 ▼]                  │      │   │
│ │ │ [校正する] ボタン                      │      │   │
│ │ └─────────────────────────────────────┘      │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─ 校正結果タブ ───────────────────────────────┐   │
│ │ ✅ 校正が完了しました                          │   │
│ │ ┌────────────────────────────────────────┐  │   │
│ │ │ [校正済みテキスト - 読み取り専用]         │  │   │
│ │ └────────────────────────────────────────┘  │   │
│ └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

#### 2.2 プロジェクト設定セクション
```
┌─────────────────────────────────────────────────────┐
│ 🔧 プロジェクト設定                                  │
│                                                     │
│ 🗂️ プロジェクトを選択                              │
│ [プロジェクト選択ドロップダウン ▼] [+ 新規]         │
│                                                     │
│ AIサービス: Gemini  モデル: gemini-1.5-flash       │
│                                                     │
│ 📚 固有名詞辞書                                     │
│ [固有名詞を管理 >]                                  │
└─────────────────────────────────────────────────────┘
```

#### 2.3 字幕生成設定
```
┌─────────────────────────────────────────────────────┐
│ ⚙️ 字幕生成設定                                      │
│                                                     │
│ ┌─────────┬─────────────┬──────────┐             │
│ │ 言語     │ 最大文字数/行│ 最大行数   │             │
│ │ 🇯🇵日本語│ [13]         │ [2行 ▼]    │             │
│ └─────────┴─────────────┴──────────┘             │
│                                                     │
│ ※ グローバル設定は設定画面から変更できます          │
│    改行最適化は設定のデフォルトAIサービスを使用     │
└─────────────────────────────────────────────────────┘
```

#### 2.4 字幕生成ボタン
```
┌─────────────────────────────────────────────────────┐
│ [字幕を生成]  ← 全幅ボタン                          │
└─────────────────────────────────────────────────────┘
```

#### 2.5 字幕生成結果
```
┌─────────────────────────────────────────────────────┐
│ ✅ 字幕生成完了！ 45個の字幕エントリを生成しました   │
└─────────────────────────────────────────────────────┘

┌──────────────────────┬──────────────────────┐
│ [📥 SRTダウンロード]  │ [📥 VTTダウンロード]  │
└──────────────────────┴──────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [📊 タイムライン表示]                                │
└─────────────────────────────────────────────────────┘
```

#### 2.6 タイムライン表示
```
┌─────────────────────────────────────────────────────┐
│ タイムライン（100ms単位調整）                        │
│                                                     │
│  0s    5s    10s   15s   20s   25s   30s          │
│ ─┬─────┬─────┬─────┬─────┬─────┬─────           │
│  │                                                 │
│  [█ #1  ][██ #2    ]  [█ #3  ]                    │
│     [██ #4    ]  [█ #5  ]    [██ #6    ]          │
│  [█ #7  ]        [███ #8      ]                    │
│                                                     │
│ ※ クリックで選択、編集エリアに表示                  │
└─────────────────────────────────────────────────────┘
```

#### 2.7 字幕編集リスト
```
┌─────────────────────────────────────────────────────┐
│ 字幕編集（45件）                                     │
│                                                     │
│ ┌───────────────────────────────────────────────┐ │
│ │ #1  [開始時間]          [期間]          [終了時間]│ │
│ │ ✕   00:00:01,000  →  2.50s  →  00:00:03,500   │ │
│ │     [▲][▼]                       [▲][▼]        │ │
│ │                                                 │ │
│ │     字幕テキスト                                │ │
│ │     ┌─────────────────────────────────────┐  │ │
│ │     │ [テキストエリア - 2行]                │  │ │
│ │     └─────────────────────────────────────┘  │ │
│ │                                                 │ │
│ │     総文字数: 24  行数: 2 / 2                   │ │
│ │     L1: この文章は13文字です  13/13 ✓          │ │
│ │     L2: これも13文字です      11/13 ✓          │ │
│ └───────────────────────────────────────────────┘ │
│                                                     │
│ ... (他44件)                                         │
└─────────────────────────────────────────────────────┘
```

### 3. 主要機能

#### 3.1 タイムスタンプ生成
```typescript
// リアルタイムスタンプがある場合
const words = transcriptionResult?.words && transcriptionResult.words.length > 0
  ? transcriptionResult.words
  : transcriptionResult?.segments && transcriptionResult.segments.length > 0
  ? generateWordsFromSegments(transcriptionResult.segments, localLanguage)
  : transcriptionResult?.text
  ? generateWordsFromText(transcriptionResult.text, localLanguage)
  : null

// セグメントから疑似ワード生成
function generateWordsFromSegments(segments: any[], language: 'en' | 'ja'): TranscriptionWord[] {
  const allWords: TranscriptionWord[] = []
  segments.forEach(segment => {
    const segmentDuration = segment.end - segment.start
    let words: string[]

    if (language === 'ja') {
      // 日本語: 句読点で分割 + 15文字チャンク
      words = splitJapaneseText(segment.text)
    } else {
      // 英語: 単語で分割
      words = segment.text.split(/\s+/).filter(w => w.trim())
    }

    const wordDuration = segmentDuration / words.length
    words.forEach((word, idx) => {
      allWords.push({
        word: word.trim(),
        start: segment.start + idx * wordDuration,
        end: segment.start + (idx + 1) * wordDuration,
      })
    })
  })
  return allWords
}

// テキストのみから疑似ワード生成
function generateWordsFromText(text: string, language: 'en' | 'ja'): TranscriptionWord[] {
  let words: string[]

  if (language === 'ja') {
    words = splitJapaneseText(text)
  } else {
    words = text.split(/\s+/).filter(w => w.trim())
  }

  const avgWordDuration = language === 'ja' ? 2.0 : 0.5
  const wordGap = 0.1

  return words.map((word, index) => ({
    word: word.trim(),
    start: index * (avgWordDuration + wordGap),
    end: index * (avgWordDuration + wordGap) + avgWordDuration,
  }))
}
```

#### 3.2 校正機能（統合）
```typescript
const handleProofread = async () => {
  if (!inputText.trim()) {
    setProofreadingError('校正するテキストを入力してください')
    return
  }

  const service = aiPreferences.defaultService
  const apiKey = service === 'openai' ? apiKeys.openai
    : service === 'claude' ? apiKeys.claude
    : apiKeys.gemini

  setIsProofreading(true)
  setProofreadingError('')

  try {
    const response = await fetch('/api/proofread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: inputText,
        service,
        language,
        apiKey,
        customContext,
        includeProperNouns: true,
      }),
    })

    const data = await response.json()
    setProofreadingResult(data)
    setLeftTab('result')
  } catch (err) {
    setProofreadingError(err.message)
  } finally {
    setIsProofreading(false)
  }
}
```

#### 3.3 字幕生成
```typescript
const handleGenerate = async () => {
  // 校正結果がある場合はそちらを使用
  let wordsToUse = words
  if (proofreadingResult && leftTab === 'result') {
    wordsToUse = generateWordsFromText(proofreadingResult.corrected_text, localLanguage)
  } else if (!wordsToUse && inputText.trim()) {
    wordsToUse = generateWordsFromText(inputText, localLanguage)
  }

  if (!wordsToUse || wordsToUse.length === 0) {
    setError('字幕を生成するためのテキストまたはword情報がありません')
    return
  }

  const lineBreakService = aiPreferences.defaultService === 'openai' ? 'chatgpt' : aiPreferences.defaultService
  const apiKey = aiPreferences.defaultService === 'openai' ? apiKeys.openai
    : aiPreferences.defaultService === 'claude' ? apiKeys.claude
    : apiKeys.gemini

  setIsGenerating(true)
  setError('')

  try {
    const response = await fetch('/api/subtitles/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words: wordsToUse,
        settings: {
          language: localLanguage,
          maxCharsPerLine: localMaxCharsPerLine,
          maxLines: localMaxLines,
          lineBreakService,
          lineBreakApiKey: apiKey,
        },
        language: localLanguage,
      }),
    })

    const data = await response.json()
    setResult(data)
    setEditingSubtitles(data.subtitles)

    if (onSubtitleGenerated && data.srtContent && data.vttContent) {
      onSubtitleGenerated(data.srtContent, data.vttContent)
    }
  } catch (err) {
    setError(err.message)
  } finally {
    setIsGenerating(false)
  }
}
```

#### 3.4 字幕編集
```typescript
// テキスト編集
const handleTextChange = (index: number, value: string) => {
  handleUpdateSubtitle(index, 'text', value)
  const lines = value.split('\n').filter(l => l.trim())
  handleUpdateSubtitle(index, 'lines', lines)
}

// タイム調整（±100ms）
const adjustTime = (index: number, field: 'startTime' | 'endTime', delta: number) => {
  const updated = [...editingSubtitles]
  const newTime = Math.max(0, updated[index][field] + delta)
  updated[index] = { ...updated[index], [field]: newTime }
  setEditingSubtitles(updated)
}

// 字幕削除
const deleteSubtitle = (index: number) => {
  const updated = editingSubtitles.filter((_, i) => i !== index)
  updated.forEach((sub, i) => {
    sub.index = i + 1
  })
  setEditingSubtitles(updated)
}

// SRT/VTT再生成
const regenerateSRT = () => {
  let content = ''
  editingSubtitles.forEach((subtitle, idx) => {
    content += `${idx + 1}\n`
    content += `${formatTimestampSRT(subtitle.startTime)} --> ${formatTimestampSRT(subtitle.endTime)}\n`
    content += subtitle.lines.join('\n')
    content += '\n\n'
  })
  return content
}
```

---

## 🔄 共通機能・パターン

### 1. プロジェクト管理（重複実装）

#### 現状の問題
- `ProofreadingSection` と `SubtitleGenerator` で同じコードが重複
- プロジェクト読み込み、選択、作成、コンテキスト保存のロジックが同一

#### 共通化すべきコード
```typescript
// useProject.ts カスタムフックに移動すべき
export function useProject() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [customContext, setCustomContext] = useState('')
  const [showNewProjectInput, setShowNewProjectInput] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    if (selectedProjectId && customContext !== undefined) {
      const timeoutId = setTimeout(() => {
        handleSaveProjectContext()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [customContext, selectedProjectId])

  return {
    projects,
    selectedProjectId,
    customContext,
    showNewProjectInput,
    newProjectName,
    setCustomContext,
    setShowNewProjectInput,
    setNewProjectName,
    handleProjectSelect,
    handleCreateProject,
    loadProjects,
  }
}
```

### 2. 固有名詞管理モーダル

#### ProperNounsModalMinimal.tsx の構造
```typescript
interface ProperNounsModalMinimalProps {
  onClose: () => void
}

export default function ProperNounsModalMinimal({ onClose }: ProperNounsModalMinimalProps) {
  // 現在のプロジェクトIDを取得
  const currentProjectId = storage.getCurrentProjectId()

  // 固有名詞エントリの管理
  const [entries, setEntries] = useState<DictionaryEntry[]>([])
  const [newTerm, setNewTerm] = useState('')
  const [newReading, setNewReading] = useState('')
  const [editingEntry, setEditingEntry] = useState<DictionaryEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // エントリのCRUD操作
  const addEntry = () => { /* ... */ }
  const updateEntry = (entry: DictionaryEntry) => { /* ... */ }
  const deleteEntry = (entryId: string) => { /* ... */ }

  return (
    <Modal>
      {/* クイック登録フォーム */}
      {/* 検索バー */}
      {/* エントリ一覧 */}
    </Modal>
  )
}
```

### 3. ファイルアップロード（重複実装）

#### 共通パターン
```typescript
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  setFileUploadError('')

  const allowedExtensions = ['.srt', '.txt', '.md']
  const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))

  if (!allowedExtensions.includes(fileExtension)) {
    setFileUploadError('対応していないファイル形式です')
    e.target.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const content = event.target?.result as string
      let parsedText = ''

      if (fileExtension === '.srt') {
        parsedText = parseSRTFile(content)
      } else {
        parsedText = content
      }

      setInputText(parsedText)
      setUploadedFileName(file.name)
      setFileUploadError('')
    } catch (err) {
      setFileUploadError(`ファイルの読み込みに失敗しました: ${err.message}`)
    }
  }

  reader.readAsText(file, 'UTF-8')
  e.target.value = ''
}
```

---

## 📊 データフロー詳細

### 1. 校正フロー
```
ユーザー入力
    ↓
originalText (State)
    ↓
[校正を開始] クリック
    ↓
handleProofread()
    ↓
/api/proofread (API Route)
    ↓
AI Service (OpenAI/Claude/Gemini)
    ↓
ProofreadingResult
    ↓
setProofreadingResult() → leftTab='result'に切り替え
    ↓
校正結果表示 + 修正箇所・提案表示
```

### 2. 字幕生成フロー
```
ユーザー入力 or 書き起こし結果
    ↓
inputText (State)
    ↓
[校正する] クリック（オプション）
    ↓
proofreadingResult (State)
    ↓
[字幕を生成] クリック
    ↓
handleGenerate()
    ↓
words生成（リアル/セグメント/疑似）
    ↓
/api/subtitles/generate (API Route)
    ↓
AI改行最適化（オプション）
    ↓
SubtitleGenerationResult
    ↓
editingSubtitles (State)
    ↓
タイムライン表示 + 編集UI
    ↓
ユーザー編集
    ↓
[SRT/VTTダウンロード]
```

### 3. プロジェクト・固有名詞フロー
```
localStorage
    ↓
projects / dictionaries / dictionary_entries
    ↓
loadProjects()
    ↓
projects (State) / selectedProjectId (State)
    ↓
handleProjectSelect()
    ↓
loadProjectContext() → customContext (State)
    ↓
customContext変更（ユーザー入力）
    ↓
500ms debounce
    ↓
handleSaveProjectContext()
    ↓
storage.saveProject()
    ↓
localStorage更新
```

---

## 🎯 改善提案（コンポーネント統一）

### 1. 共通コンポーネント抽出

#### ProjectSelectorCard.tsx
```typescript
interface ProjectSelectorCardProps {
  projects: Project[]
  selectedProjectId: string
  customContext: string
  onProjectSelect: (id: string) => void
  onContextChange: (context: string) => void
  onCreateProject: (name: string) => void
  showProperNounsButton?: boolean
  onOpenProperNouns?: () => void
}

export default function ProjectSelectorCard(props: ProjectSelectorCardProps) {
  // プロジェクト選択UI
  // コンテキスト入力UI
  // 固有名詞管理ボタン（オプション）
}
```

#### FileUploadSection.tsx
```typescript
interface FileUploadSectionProps {
  onFileLoaded: (text: string, fileName: string) => void
  onError: (error: string) => void
  acceptedFormats: string[]
  isOpen?: boolean
}

export default function FileUploadSection(props: FileUploadSectionProps) {
  // アコーディオン
  // ファイル選択
  // パース処理
}
```

### 2. カスタムフック

#### useProject.ts
```typescript
export function useProject() {
  // プロジェクト管理ロジック
  // 自動保存ロジック
  // CRUD操作
}
```

#### useProperNouns.ts
```typescript
export function useProperNouns(projectId: string) {
  // 固有名詞CRUD
  // 検索・フィルタリング
  // インポート・エクスポート
}
```

#### useProofreading.ts
```typescript
export function useProofreading(apiKeys: ApiKeys, aiPreferences: AIPreferences) {
  // 校正ロジック
  // API呼び出し
  // エラーハンドリング
}
```

### 3. データ構造統一

#### Project と Dictionary の統合
```typescript
// 現状: ProjectとDictionaryが別々
interface Project {
  id: string
  name: string
  customContext: string
}

interface Dictionary {
  id: string
  name: string
}

// 提案: Projectに統合
interface Project {
  id: string
  name: string
  description?: string  // UI表示用
  customContext: string  // AI校正用コンテキスト
  entries: DictionaryEntry[]  // 固有名詞を含める
  created_at: string
  updated_at: string
}
```

---

## 🔍 コンポーネント比較表

| 機能 | ProofreadingSection | SubtitleGenerator | 共通化の必要性 |
|------|---------------------|-------------------|----------------|
| テキスト入力 | ✅ タブ切り替え | ✅ タブ切り替え | ⚠️ 似ているが異なる |
| ファイルアップロード | ✅ SRT/TXT/MD | ✅ SRT/TXT/MD | ✅ 完全に共通化可能 |
| プロジェクト管理 | ✅ 完全実装 | ✅ 完全実装 | ✅ **完全に重複** |
| コンテキスト入力 | ✅ 自動保存 | ✅ 自動保存 | ✅ **完全に重複** |
| 固有名詞管理 | ✅ モーダル呼び出し | ✅ モーダル呼び出し | ✅ 同じモーダル使用 |
| AI設定表示 | ✅ ミニマル表示 | ✅ ミニマル表示 | ✅ 完全に共通化可能 |
| 校正機能 | ✅ メイン機能 | ✅ 統合機能 | ⚠️ 実装は異なる |
| 字幕生成 | ❌ | ✅ メイン機能 | - |
| 字幕編集 | ❌ | ✅ タイムライン等 | - |

---

## 📝 まとめ

### 現状の問題点
1. **プロジェクト管理UIが完全に重複**（約200行）
2. **ファイルアップロードロジックが重複**（約100行）
3. **固有名詞管理が2つのコンポーネントに分散**
4. **データ構造の不一致**（Project vs Dictionary）

### 優先改善項目
1. ✅ **高優先度**: ProjectSelectorCard の作成（重複排除）
2. ✅ **高優先度**: useProject() カスタムフック（ロジック共通化）
3. ✅ **中優先度**: FileUploadSection の共通化
4. ⚠️ **低優先度**: Project/Dictionary データ構造統一（破壊的変更）

### 期待される効果
- コード量: 約30%削減
- 保守性: 大幅向上
- 一貫性: UI/UXの統一
- バグ減少: 単一実装によるバグ混入防止
