/**
 * 字幕フォーマットプリセット定義
 * 
 * Netflix, U-NEXT, Amazon Prime, 劇場, NHK, 民放, YouTube/Web
 * 各プラットフォームの業界標準ルールを定義
 */

import { 
  SubtitlePreset, 
  SubtitlePlatform, 
  LineBreakPattern, 
  LineBreakPatternType,
  SegmentSplitPattern,
  SegmentSplitPatternType 
} from './types'

// ============================================
// プラットフォーム別字幕プリセット
// ============================================

export const SUBTITLE_PRESETS: Record<SubtitlePlatform, SubtitlePreset> = {
  // Netflix 英語
  netflix_en: {
    id: 'netflix_en',
    name: 'Netflix (英語)',
    description: 'Netflix英語字幕の標準フォーマット。42文字/行、20 CPS、禁止ギャップあり',
    language: 'en',
    maxCharsPerLine: 42,
    maxLines: 2,
    maxCPS: 20,
    minDuration: 0.833,  // 5/6秒 = 833ms (20フレーム@24fps)
    maxDuration: 7.0,
    minGapFrames: 2,
    forbiddenGapRange: { min: 3, max: 11 },  // 3-11フレームは禁止
    outExtensionFrames: 12,
    usePunctuation: true,
    defaultFps: 24,
    notes: '句読点後で改行、接続詞前で改行、冠詞と名詞を分けない',
  },

  // Netflix 日本語
  netflix_ja: {
    id: 'netflix_ja',
    name: 'Netflix (日本語)',
    description: 'Netflix日本語字幕の標準フォーマット。13文字/行、4 CPS、句読点なし',
    language: 'ja',
    maxCharsPerLine: 13,
    maxLines: 2,
    maxCPS: 4,
    minDuration: 0.5,  // 500ms (12フレーム@24fps)
    maxDuration: 6.5,
    minGapFrames: 3,
    outExtensionFrames: 12,
    usePunctuation: false,  // 句読点は使用しない、スペースで代替
    defaultFps: 24,
    notes: '文節で区切り、助詞から始めない。句読点の代わりにスペース使用',
  },

  // U-NEXT
  unext: {
    id: 'unext',
    name: 'U-NEXT',
    description: 'U-NEXTの字幕フォーマット。Netflix準拠、14文字/行',
    language: 'ja',
    maxCharsPerLine: 14,
    maxLines: 2,
    maxCPS: 4,
    minDuration: 0.5,
    maxDuration: 6.5,
    minGapFrames: 3,
    outExtensionFrames: 12,
    usePunctuation: false,
    defaultFps: 24,
    notes: 'Netflixとほぼ同等、1行14文字まで許容',
  },

  // Amazon Prime 英語
  amazon_prime_en: {
    id: 'amazon_prime_en',
    name: 'Amazon Prime (英語)',
    description: 'Amazon Prime Video英語字幕。Netflix準拠',
    language: 'en',
    maxCharsPerLine: 42,
    maxLines: 2,
    maxCPS: 20,
    minDuration: 0.833,
    maxDuration: 7.0,
    minGapFrames: 2,
    forbiddenGapRange: { min: 3, max: 11 },
    outExtensionFrames: 12,
    usePunctuation: true,
    defaultFps: 24,
    notes: 'Netflix英語と同等',
  },

  // Amazon Prime 日本語
  amazon_prime_ja: {
    id: 'amazon_prime_ja',
    name: 'Amazon Prime (日本語)',
    description: 'Amazon Prime Video日本語字幕。Netflix準拠',
    language: 'ja',
    maxCharsPerLine: 13,
    maxLines: 2,
    maxCPS: 4,
    minDuration: 0.5,
    maxDuration: 6.5,
    minGapFrames: 3,
    outExtensionFrames: 12,
    usePunctuation: false,
    defaultFps: 24,
    notes: 'Netflix日本語と同等',
  },

  // 劇場 シネマスコープ
  theater_cinemascope: {
    id: 'theater_cinemascope',
    name: '劇場 (シネマスコープ)',
    description: 'シネマスコープ比(2.35:1)の劇場上映向け。縦画面高が狭いため11文字/行',
    language: 'ja',
    maxCharsPerLine: 11,
    maxLines: 2,
    maxCPS: 4,
    minDuration: 0.5,
    maxDuration: 6.5,
    minGapFrames: 3,
    outExtensionFrames: 10,
    usePunctuation: false,
    defaultFps: 24,
    notes: '縦画面高が小さいため文字数制限が厳しい。1931年田村幸彦基準',
  },

  // 劇場 ビスタ
  theater_vista: {
    id: 'theater_vista',
    name: '劇場 (ビスタ)',
    description: 'ビスタサイズ(1.85:1)の劇場上映向け。標準13文字/行',
    language: 'ja',
    maxCharsPerLine: 13,
    maxLines: 2,
    maxCPS: 4,
    minDuration: 0.5,
    maxDuration: 6.5,
    minGapFrames: 3,
    outExtensionFrames: 10,
    usePunctuation: false,
    defaultFps: 24,
    notes: '標準的な劇場字幕。1931年田村幸彦基準',
  },

  // NHK放送
  nhk_broadcast: {
    id: 'nhk_broadcast',
    name: 'NHK放送',
    description: 'NHK放送用字幕。バリアフリー対応、16-17文字/行、7 CPS',
    language: 'ja',
    maxCharsPerLine: 17,
    maxLines: 2,
    maxCPS: 7,  // SDH/バリアフリー字幕は7 CPS
    minDuration: 0.5,
    maxDuration: 7.0,
    minGapFrames: 3,
    outExtensionFrames: 10,
    usePunctuation: true,  // 放送字幕は句読点使用可
    defaultFps: 30,  // 放送は29.97/30fps
    notes: 'SDH対応。話者識別、効果音、音楽情報を含む',
  },

  // 民放
  commercial_broadcast: {
    id: 'commercial_broadcast',
    name: '民放 (商業放送)',
    description: '民間放送局用字幕。柔軟なルール、16文字/行、6 CPS',
    language: 'ja',
    maxCharsPerLine: 16,
    maxLines: 2,
    maxCPS: 6,
    minDuration: 0.5,
    maxDuration: 7.0,
    minGapFrames: 3,
    outExtensionFrames: 10,
    usePunctuation: true,
    defaultFps: 30,
    notes: 'NHKより柔軟なルール。各局で若干の差異あり',
  },

  // YouTube/Web
  youtube_web: {
    id: 'youtube_web',
    name: 'YouTube / Web',
    description: 'YouTube、Webコンテンツ向け。柔軟なルール、20文字/行',
    language: 'both',
    maxCharsPerLine: 20,
    maxLines: 2,
    maxCPS: 6,
    minDuration: 1.0,  // Webは長めの表示が一般的
    maxDuration: 7.0,
    minGapFrames: 2,
    outExtensionFrames: 15,
    usePunctuation: true,
    defaultFps: 30,
    notes: 'カジュアルなコンテンツ向け。句読点使用可、改行位置は柔軟',
  },

  // カスタム
  custom: {
    id: 'custom',
    name: 'カスタム',
    description: 'ユーザー定義のカスタム設定',
    language: 'both',
    maxCharsPerLine: 13,
    maxLines: 2,
    maxCPS: 4,
    minDuration: 0.5,
    maxDuration: 7.0,
    minGapFrames: 3,
    outExtensionFrames: 12,
    usePunctuation: false,
    defaultFps: 24,
  },
}

// ============================================
// 改行パターンプリセット
// ============================================

export const LINE_BREAK_PATTERNS: Record<LineBreakPatternType, LineBreakPattern> = {
  // Netflix標準（英語）
  netflix: {
    id: 'netflix',
    name: 'Netflix標準',
    description: '句読点優先、接続詞・前置詞前で改行。冠詞と名詞を分けない',
    language: 'en',
    rules: {
      breakAfterPunctuation: true,
      breakBeforeConjunctions: true,
      breakBeforePrepositions: true,
      keepSemanticUnits: true,
      balanceLineLengths: false,
      noPunctuationMode: false,
      noParticleStart: false,
    },
  },

  // BBC標準（英語）
  bbc: {
    id: 'bbc',
    name: 'BBC標準',
    description: '意味単位を重視、バランスの取れた行長',
    language: 'en',
    rules: {
      breakAfterPunctuation: true,
      breakBeforeConjunctions: true,
      breakBeforePrepositions: false,  // 前置詞前では切らない
      keepSemanticUnits: true,
      balanceLineLengths: true,
      noPunctuationMode: false,
      noParticleStart: false,
    },
  },

  // TED標準（英語）
  ted: {
    id: 'ted',
    name: 'TED標準',
    description: '言語的まとまり（linguistic wholes）を保持、行長均等化',
    language: 'en',
    rules: {
      breakAfterPunctuation: true,
      breakBeforeConjunctions: true,
      breakBeforePrepositions: true,
      keepSemanticUnits: true,
      balanceLineLengths: true,
      noPunctuationMode: false,
      noParticleStart: false,
    },
  },

  // バランス型（英語）
  balanced: {
    id: 'balanced',
    name: 'バランス型',
    description: '行長の均等化を最優先。視覚的バランス重視',
    language: 'en',
    rules: {
      breakAfterPunctuation: false,
      breakBeforeConjunctions: false,
      breakBeforePrepositions: false,
      keepSemanticUnits: false,
      balanceLineLengths: true,
      noPunctuationMode: false,
      noParticleStart: false,
    },
  },

  // 文節区切り（日本語）
  bunsetsu: {
    id: 'bunsetsu',
    name: '文節区切り',
    description: '助詞の前で区切り、助詞から始めない。文法的まとまりを保持',
    language: 'ja',
    rules: {
      breakAfterPunctuation: false,  // 句読点なしモード
      breakBeforeConjunctions: false,
      breakBeforePrepositions: false,
      keepSemanticUnits: true,
      balanceLineLengths: false,
      noPunctuationMode: true,
      noParticleStart: true,  // 助詞から始めない
    },
  },

  // 意味単位（日本語）
  semantic: {
    id: 'semantic',
    name: '意味単位',
    description: '意味のまとまりを最優先。自然な区切り位置で改行',
    language: 'ja',
    rules: {
      breakAfterPunctuation: false,
      breakBeforeConjunctions: false,
      breakBeforePrepositions: false,
      keepSemanticUnits: true,
      balanceLineLengths: false,
      noPunctuationMode: true,
      noParticleStart: true,
    },
  },

  // 上下均等（日本語）
  equal_length: {
    id: 'equal_length',
    name: '上下均等',
    description: '上下の行長を均等化。視覚的バランス重視',
    language: 'ja',
    rules: {
      breakAfterPunctuation: false,
      breakBeforeConjunctions: false,
      breakBeforePrepositions: false,
      keepSemanticUnits: false,
      balanceLineLengths: true,
      noPunctuationMode: true,
      noParticleStart: true,
    },
  },

  // 映画字幕調（日本語）
  movie_subtitle: {
    id: 'movie_subtitle',
    name: '映画字幕調',
    description: '句読点なし、スペースで代替。1931年田村幸彦基準',
    language: 'ja',
    rules: {
      breakAfterPunctuation: false,
      breakBeforeConjunctions: false,
      breakBeforePrepositions: false,
      keepSemanticUnits: true,
      balanceLineLengths: false,
      noPunctuationMode: true,
      noParticleStart: true,
    },
  },
}

// ============================================
// セグメント分割パターン
// ============================================

export const SEGMENT_SPLIT_PATTERNS: Record<SegmentSplitPatternType, SegmentSplitPattern> = {
  // 話者変更
  speaker_change: {
    id: 'speaker_change',
    name: '話者変更',
    description: '話者が変わるタイミングで分割',
    config: {
      splitOnSentenceEnd: false,
      splitOnSpeakerChange: true,
    },
  },

  // ポーズ検出
  pause_detection: {
    id: 'pause_detection',
    name: 'ポーズ検出',
    description: '1秒以上のポーズで分割',
    config: {
      pauseThreshold: 1.0,
      splitOnSentenceEnd: false,
      splitOnSpeakerChange: false,
    },
  },

  // 文末区切り
  sentence_end: {
    id: 'sentence_end',
    name: '文末区切り',
    description: '文末（。！？.!?）で分割',
    config: {
      splitOnSentenceEnd: true,
      splitOnSpeakerChange: false,
    },
  },

  // 時間ベース
  time_based: {
    id: 'time_based',
    name: '時間ベース',
    description: '最大6秒で強制分割',
    config: {
      maxDuration: 6.0,
      splitOnSentenceEnd: false,
      splitOnSpeakerChange: false,
    },
  },

  // 文字数ベース
  char_based: {
    id: 'char_based',
    name: '文字数ベース',
    description: '最大26文字（2行×13文字）で分割',
    config: {
      maxChars: 26,
      splitOnSentenceEnd: false,
      splitOnSpeakerChange: false,
    },
  },
}

// ============================================
// ヘルパー関数
// ============================================

// 言語に応じたプリセットを取得
export function getPresetsForLanguage(language: 'en' | 'ja' | 'both'): SubtitlePreset[] {
  return Object.values(SUBTITLE_PRESETS).filter(
    preset => preset.language === language || preset.language === 'both'
  )
}

// 言語に応じた改行パターンを取得
export function getLineBreakPatternsForLanguage(language: 'en' | 'ja'): LineBreakPattern[] {
  return Object.values(LINE_BREAK_PATTERNS).filter(
    pattern => pattern.language === language || pattern.language === 'both'
  )
}

// プリセットIDからプリセットを取得
export function getPresetById(id: SubtitlePlatform): SubtitlePreset | undefined {
  return SUBTITLE_PRESETS[id]
}

// 改行パターンIDからパターンを取得
export function getLineBreakPatternById(id: LineBreakPatternType): LineBreakPattern | undefined {
  return LINE_BREAK_PATTERNS[id]
}

// セグメント分割パターンIDからパターンを取得
export function getSegmentSplitPatternById(id: SegmentSplitPatternType): SegmentSplitPattern | undefined {
  return SEGMENT_SPLIT_PATTERNS[id]
}

// デフォルトプリセットを取得
export function getDefaultPreset(language: 'en' | 'ja'): SubtitlePreset {
  return language === 'en' ? SUBTITLE_PRESETS.netflix_en : SUBTITLE_PRESETS.netflix_ja
}

