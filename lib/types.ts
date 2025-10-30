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
