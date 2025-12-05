// 文字起こし関連の型定義
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  speaker?: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  segments?: TranscriptionSegment[];
  words?: TranscriptionWord[];
}

export interface TranscriptionRequest {
  audioFile: File;
  service: 'openai' | 'elevenlabs' | 'whisperx';
  language?: string;
}

// 校正関連の型定義
export interface ProofreadingChange {
  type: string;
  original: string;
  corrected: string;
  reason: string;
}

export interface ProofreadingResult {
  success: boolean;
  corrected_text: string;
  changes: ProofreadingChange[];
  suggestions: string[];
  segments?: TranscriptionSegment[];  // タイムスタンプ付きセグメント（校正済み）
  words?: TranscriptionWord[];  // タイムスタンプ付きワード（元データ保持）
  service?: string;
  model?: string;
  error?: string;
}

export interface ProofreadingRequest {
  text: string;
  segments?: TranscriptionSegment[];  // タイムスタンプ付きセグメント
  words?: TranscriptionWord[];  // タイムスタンプ付きワード
  service: 'openai' | 'claude' | 'gemini';
  language: 'ja' | 'en';
  includeProperNouns?: boolean;
}

// 固有名詞関連の型定義
export interface ProperNoun {
  id?: number;
  term: string;
  reading?: string;
  category?: string;
  description?: string;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
  projectId?: string; // プロジェクト/辞書ID
}

// プロジェクト/辞書の型定義
export interface Dictionary {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

// プロジェクト設定の型定義（AI校正用コンテキスト + 固有名詞辞書を含む）
export interface Project {
  id: string;
  name: string;
  description?: string;
  customContext: string;  // AI校正用のカスタムコンテキスト
  created_at?: string;
  updated_at?: string;
}

// 辞書エントリの型定義（テーブル用）
export interface DictionaryEntry {
  id: string;
  term: string;
  reading: string;
  dictionaryId: string;
}

// API設定の型定義
export interface ApiKeys {
  openai?: string;
  elevenlabs?: string;
  claude?: string;
  gemini?: string;
}

// AI設定の型定義（デフォルトサービスとモデル）
export interface AIPreferences {
  defaultService: 'openai' | 'claude' | 'gemini';
  openaiModel: string;
  claudeModel: string;
  geminiModel: string;
  // Geminiモデルの使い分け
  geminiModelScript: string;    // 脚本分析・キャラクター抽出用（高機能）
  geminiModelTranslate: string;  // 翻訳用（標準）
  geminiModelLight: string;      // 固有名詞抽出等（軽量・無料）
}

// 字幕設定の型定義（言語別）
export interface LanguageSubtitleSettings {
  maxCharsPerLine: number;
  maxLines: number;
}

// 字幕設定の型定義
export interface SubtitleSettings {
  currentLanguage: 'en' | 'ja';
  en: LanguageSubtitleSettings;
  ja: LanguageSubtitleSettings;
  lineBreakService: 'chatgpt' | 'claude' | 'gemini';
}

// 字幕エントリの型定義
export interface SubtitleEntry {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  lines: string[];
}

// 字幕生成リクエストの型定義（API用）
export interface SubtitleGenerationSettings {
  language: 'en' | 'ja';
  maxCharsPerLine: number;
  maxLines: number;
  lineBreakService: 'chatgpt' | 'claude' | 'gemini';
  lineBreakApiKey?: string;
}

export interface SubtitleGenerationRequest {
  words: TranscriptionWord[];
  settings: SubtitleGenerationSettings;
  language: 'en' | 'ja';
}

// 字幕生成結果の型定義
export interface SubtitleGenerationResult {
  success: boolean;
  subtitles: SubtitleEntry[];
  srtContent: string;
  vttContent: string;
  error?: string;
}

// ダウンロードフォーマットの型定義
export type DownloadFormat = 'txt' | 'json' | 'srt' | 'vtt';

// ============================================
// 映画字幕翻訳システム関連の型定義
// ============================================

// キャラクターの口調タイプ
export type SpeechStyleType = 
  | 'polite'      // 敬語
  | 'casual'      // タメ口
  | 'rough'       // 粗野
  | 'formal'      // フォーマル
  | 'childish'    // 幼児言葉
  | 'elderly'     // 老人風
  | 'archaic'     // 古風・時代劇風
  | 'dialect'     // 方言
  | 'robot'       // ロボット・AI風
  | 'noble'       // 貴族風
  | 'military'    // 軍人風
  | 'custom';     // カスタム

// 一人称の選択肢
export type FirstPersonPronoun = 
  | '私' | 'わたし' | 'あたし' | 'わたくし'
  | '僕' | 'ぼく' | '俺' | 'おれ' | 'オレ'
  | '自分' | 'わし' | '拙者' | '余' | '我'
  | 'あたい' | 'うち' | 'おいら' | 'custom';

// 二人称の選択肢
export type SecondPersonPronoun =
  | 'あなた' | '君' | 'きみ' | 'お前' | 'おまえ'
  | '貴様' | 'てめえ' | 'あんた' | 'そなた'
  | 'お主' | '貴公' | 'custom';

// キャラクター定義
export interface Character {
  id: string;
  projectId: string;
  name: string;
  nameReading?: string;       // ふりがな
  gender: 'male' | 'female' | 'unknown' | 'other';
  ageGroup: 'child' | 'teen' | 'young_adult' | 'adult' | 'middle_aged' | 'elderly';
  speechStyle: SpeechStyleType;
  firstPerson: FirstPersonPronoun | string;
  secondPerson: SecondPersonPronoun | string;
  sentenceEndings: string[];  // 特徴的な語尾（例: 「〜だぜ」「〜ですわ」）
  characterTraits: string;    // キャラクターの特徴説明
  sampleDialogues: string[];  // サンプルセリフ（翻訳の参考用）
  speakerId?: string;         // 話者分離で割り当てられたID
  color?: string;             // UIでの表示色
  created_at?: string;
  updated_at?: string;
  
  // 包括的ペルソナ情報
  personality?: string;           // 性格の詳細説明
  background?: string;            // 背景・経歴
  relationships?: string;         // 他のキャラクターとの関係性
  speechPatterns?: {
    firstPerson: string;         // 一人称（既存のfirstPersonと統合可能）
    secondPerson: string;        // 二人称（既存のsecondPersonと統合可能）
    sentenceEndings: string[];   // 語尾パターン（既存のsentenceEndingsと統合可能）
    catchphrases: string[];      // 口癖・決め台詞
    emotionalExpressions: string[]; // 感情表現の特徴
  };
  behavioralTraits?: string[];    // 行動パターン
  values?: string[];              // 価値観・信念
  socialPosition?: string;        // 社会的立場
  contextDependentSpeech?: string; // 状況による話し方の変化
  
  // コメディ関連
  comedyLevel?: 'none' | 'subtle' | 'moderate' | 'high' | 'extreme';
  localGags?: string[];          // ローカルなギャグの種類
  humorStyle?: string;           // ユーモアのスタイル
  
  // 話者マッピング情報
  mappedSpeakerId?: string;       // 自動マッピングされた話者ID
  mappingConfidence?: number;      // マッピングの確信度（0-1）
}

// 映画/作品のジャンル
export type MovieGenre = 
  | 'action' | 'comedy' | 'drama' | 'horror' 
  | 'romance' | 'sci-fi' | 'fantasy' | 'thriller'
  | 'documentary' | 'animation' | 'musical' | 'western'
  | 'crime' | 'mystery' | 'war' | 'historical';

// 時代設定
export type EraSetting = 
  | 'ancient'       // 古代
  | 'medieval'      // 中世
  | 'edo'           // 江戸時代
  | 'meiji'         // 明治〜大正
  | 'showa_early'   // 昭和初期
  | 'showa_late'    // 昭和後期
  | 'modern'        // 現代
  | 'near_future'   // 近未来
  | 'far_future'    // 遠未来
  | 'fantasy'       // ファンタジー世界
  | 'custom';

// ターゲット視聴者
export type TargetAudience = 
  | 'all_ages'      // 全年齢
  | 'children'      // 子供向け
  | 'teens'         // 青少年向け
  | 'young_adult'   // ヤングアダルト
  | 'adult'         // 成人向け
  | 'mature';       // R指定

// 翻訳スタイル
export type TranslationStyle = 
  | 'subtitle'      // 字幕翻訳調（簡潔）
  | 'natural'       // 自然な会話調
  | 'literary'      // 文学的
  | 'localized'     // ローカライズ重視
  | 'faithful';     // 原文忠実

// 映画/作品設定
export interface MovieSettings {
  id: string;
  projectId: string;
  title: string;
  originalLanguage: 'en' | 'ja' | 'other';
  targetLanguage: 'en' | 'ja';
  genres: MovieGenre[];
  eraSetting: EraSetting;
  targetAudience: TargetAudience;
  translationStyle: TranslationStyle;
  toneDescription: string;    // 作品のトーン説明（例: 「ダークでシリアス」「軽快でコミカル」）
  specialInstructions: string; // 特別な翻訳指示
  glossary: Record<string, string>; // 用語集（原語→訳語）
  created_at?: string;
  updated_at?: string;
}

// 話者タグ付き字幕エントリ
export interface MovieSubtitleEntry extends SubtitleEntry {
  speakerId?: string;         // 話者分離ID
  characterId?: string;       // キャラクターID
  characterName?: string;     // キャラクター名
  originalText?: string;      // 翻訳前のテキスト
  translatedText?: string;    // 翻訳後のテキスト
  isTranslated?: boolean;     // 翻訳済みフラグ
  needsReview?: boolean;      // レビュー必要フラグ
  notes?: string;             // 翻訳者メモ
}

// 翻訳リクエスト
export interface TranslationRequest {
  text: string;
  sourceLanguage: 'en' | 'ja';
  targetLanguage: 'en' | 'ja';
  character?: Character;
  movieSettings?: MovieSettings;
  context?: string;           // 前後の文脈
  service: 'openai' | 'claude' | 'gemini';
  model?: string;
  apiKey: string;
}

// 翻訳結果
export interface TranslationResult {
  success: boolean;
  originalText: string;
  translatedText: string;
  alternativeTranslations?: string[];
  notes?: string;
  service: string;
  model: string;
  error?: string;
}

// バッチ翻訳リクエスト（複数セグメント）
export interface BatchTranslationRequest {
  subtitles: MovieSubtitleEntry[];
  sourceLanguage: 'en' | 'ja';
  targetLanguage: 'en' | 'ja';
  characters: Character[];
  movieSettings: MovieSettings;
  service: 'openai' | 'claude' | 'gemini';
  model?: string;
  apiKey: string;
}

// バッチ翻訳結果
export interface BatchTranslationResult {
  success: boolean;
  subtitles: MovieSubtitleEntry[];
  totalCount: number;
  translatedCount: number;
  failedCount: number;
  errors?: string[];
}

// ============================================
// 字幕タイミングバリデーション関連の型定義
// ============================================

// タイミング違反の種類
export type TimingViolationType = 
  | 'min_duration'        // 最小表示時間未満
  | 'max_duration'        // 最大表示時間超過
  | 'reading_speed'       // 読み取り速度超過 (CPS)
  | 'forbidden_gap'       // 禁止ギャップ (3-11フレーム@24fps)
  | 'char_limit'          // 文字数オーバー
  | 'overlap'             // 字幕の重複
  | 'negative_duration';  // 負の表示時間

// 警告レベル
export type ValidationSeverity = 'error' | 'warning' | 'info';

// 個別のタイミング違反
export interface TimingViolation {
  type: TimingViolationType;
  severity: ValidationSeverity;
  subtitleIndex: number;
  message: string;
  details: {
    actual: number;
    expected: number;
    unit: 'seconds' | 'frames' | 'characters' | 'cps';
  };
  autoFixable: boolean;
  suggestedFix?: {
    startTime?: number;
    endTime?: number;
    text?: string;
  };
}

// 字幕全体のバリデーション結果
export interface SubtitleTimingValidation {
  isValid: boolean;
  totalViolations: number;
  errors: number;
  warnings: number;
  violations: TimingViolation[];
  statistics: {
    totalSubtitles: number;
    avgDuration: number;
    avgCPS: number;
    minDuration: number;
    maxDuration: number;
    avgGap: number;
  };
}

// 言語別タイミング設定
export interface LanguageTimingConfig {
  minDuration: number;        // 最小表示時間（秒）
  maxDuration: number;        // 最大表示時間（秒）
  maxCPS: number;             // 最大読み取り速度（文字/秒）
  minGapFrames: number;       // 最小ギャップ（フレーム）
  forbiddenGapRange?: {       // 禁止ギャップ範囲（フレーム）
    min: number;
    max: number;
  };
  outExtensionFrames: number; // OUT点延長（フレーム）
  maxCharsPerLine: number;    // 1行あたり最大文字数
}

// FPS設定
export type FrameRate = 24 | 25 | 29.97 | 30 | 60;

// 映画字幕生成の拡張設定
export interface MovieSubtitleGenerationSettings extends SubtitleGenerationSettings {
  fps: FrameRate;
  enableTimingValidation: boolean;
  autoFixViolations: boolean;
  includeSpeakerTags: boolean;  // Netflix形式 [character] タグ
  speakerTagFormat: 'brackets' | 'dash' | 'colon';  // [name] / - name: / NAME:
}

// ============================================
// 固有名詞抽出システム
// ============================================

// 固有名詞のカテゴリ
export type ProperNounCategory = 
  | 'person'        // 人名（キャラクター名、俳優名）
  | 'place'         // 地名（場所、国、都市）
  | 'organization'  // 組織名（会社、団体）
  | 'work'          // 作品名（映画、本、曲）
  | 'technical'     // 専門用語（技術用語、業界用語）
  | 'other';        // その他固有名詞

// 抽出された固有名詞
export interface ExtractedProperNoun {
  id: string;
  term: string;              // 抽出された語
  category: ProperNounCategory;
  reading?: string;          // ふりがな（日本語）
  variants: string[];        // 表記ゆれ候補（脚本と実際の差異を考慮）
  context: string;           // 出現コンテキスト
  confidence: number;        // 信頼度 (0-1)
  approved: boolean;         // 人間による承認フラグ
  sourceFile?: string;       // 抽出元ファイル名
}

// 固有名詞抽出リクエスト
export interface ProperNounExtractionRequest {
  text: string;
  sourceType: 'script' | 'srt' | 'transcription';
  language: 'en' | 'ja';
  existingNouns?: ExtractedProperNoun[];  // 既存の固有名詞リスト（重複排除用）
}

// 固有名詞抽出結果
export interface ProperNounExtractionResult {
  success: boolean;
  nouns: ExtractedProperNoun[];
  totalFound: number;
  newCount: number;         // 新規抽出数
  duplicateCount: number;   // 既存と重複した数
  error?: string;
}

// ============================================
// 字幕フォーマットプリセット
// ============================================

// プラットフォームタイプ
export type SubtitlePlatform = 
  | 'netflix_en'
  | 'netflix_ja'
  | 'unext'
  | 'amazon_prime_en'
  | 'amazon_prime_ja'
  | 'theater_cinemascope'
  | 'theater_vista'
  | 'nhk_broadcast'
  | 'commercial_broadcast'
  | 'youtube_web'
  | 'custom';

// 字幕プリセット定義
export interface SubtitlePreset {
  id: SubtitlePlatform;
  name: string;
  description: string;
  language: 'en' | 'ja' | 'both';
  maxCharsPerLine: number;
  maxLines: number;
  maxCPS: number;                    // 読み取り速度（文字/秒）
  minDuration: number;               // 最小表示時間（秒）
  maxDuration: number;               // 最大表示時間（秒）
  minGapFrames: number;              // 最小ギャップ（フレーム）
  forbiddenGapRange?: { min: number; max: number };
  outExtensionFrames: number;
  usePunctuation: boolean;           // 句読点使用
  defaultFps: FrameRate;
  notes?: string;
}

// ============================================
// 改行・セグメント分割パターン
// ============================================

// 改行パターンタイプ
export type LineBreakPatternType = 
  | 'netflix'           // Netflix標準
  | 'bbc'               // BBC標準
  | 'ted'               // TED標準
  | 'balanced'          // バランス型
  | 'bunsetsu'          // 文節区切り（日本語）
  | 'semantic'          // 意味単位
  | 'equal_length'      // 上下均等
  | 'movie_subtitle';   // 映画字幕調

// 改行パターン定義
export interface LineBreakPattern {
  id: LineBreakPatternType;
  name: string;
  description: string;
  language: 'en' | 'ja' | 'both';
  rules: {
    breakAfterPunctuation: boolean;
    breakBeforeConjunctions: boolean;
    breakBeforePrepositions: boolean;
    keepSemanticUnits: boolean;
    balanceLineLengths: boolean;
    noPunctuationMode: boolean;      // 句読点なしモード（日本語）
    noParticleStart: boolean;        // 助詞から始めない（日本語）
  };
}

// セグメント分割パターンタイプ
export type SegmentSplitPatternType = 
  | 'speaker_change'    // 話者変更
  | 'pause_detection'   // ポーズ検出
  | 'sentence_end'      // 文末区切り
  | 'time_based'        // 時間ベース
  | 'char_based';       // 文字数ベース

// セグメント分割パターン定義
export interface SegmentSplitPattern {
  id: SegmentSplitPatternType;
  name: string;
  description: string;
  config: {
    pauseThreshold?: number;    // ポーズ閾値（秒）
    maxDuration?: number;       // 最大セグメント時間（秒）
    maxChars?: number;          // 最大文字数
    splitOnSentenceEnd: boolean;
    splitOnSpeakerChange: boolean;
  };
}