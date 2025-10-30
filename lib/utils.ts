import { TranscriptionResult, TranscriptionSegment, SubtitleSettings, AIPreferences } from './types';

// タイムスタンプフォーマット関数
export function formatTimestampSRT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}

export function formatTimestampVTT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

// SRT形式の字幕生成
export function generateSRT(result: TranscriptionResult): string {
  if (!result.segments || result.segments.length === 0) {
    return '';
  }

  let srtContent = '';
  result.segments.forEach((segment, index) => {
    const startTime = formatTimestampSRT(segment.start);
    const endTime = formatTimestampSRT(segment.end);
    let text = segment.text.trim();

    // 話者情報があれば先頭に追加
    if (segment.speaker) {
      text = `[${segment.speaker}] ${text}`;
    }

    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${text}\n\n`;
  });

  return srtContent;
}

// WebVTT形式の字幕生成
export function generateVTT(result: TranscriptionResult): string {
  if (!result.segments || result.segments.length === 0) {
    return '';
  }

  let vttContent = 'WEBVTT\n\n';
  result.segments.forEach((segment) => {
    const startTime = formatTimestampVTT(segment.start);
    const endTime = formatTimestampVTT(segment.end);
    let text = segment.text.trim();

    // 話者情報があれば先頭に追加
    if (segment.speaker) {
      text = `[${segment.speaker}] ${text}`;
    }

    vttContent += `${startTime} --> ${endTime}\n`;
    vttContent += `${text}\n\n`;
  });

  return vttContent;
}

// ファイルダウンロード関数
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// タイムスタンプ生成
export function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// デフォルト字幕設定（ガイドライン基準）
export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  currentLanguage: 'en',
  en: {
    maxCharsPerLine: 42, // Netflix標準（英語）
    maxLines: 2,
  },
  ja: {
    maxCharsPerLine: 13, // 日本語標準
    maxLines: 2,
  },
  lineBreakService: 'gemini', // 最もコスパの良いGemini 1.5 Flashをデフォルト
};

// デフォルトAI設定（最もコスパの良い組み合わせ）
export const DEFAULT_AI_PREFERENCES: AIPreferences = {
  defaultService: 'gemini', // 最もコスパが良い
  openaiModel: 'gpt-4o-mini', // OpenAIで最もコスパが良い
  claudeModel: 'claude-3-5-sonnet-20241022', // Claudeで最もコスパが良い
  geminiModel: 'gemini-1.5-flash', // 最もコスパが良い
};

// ローカルストレージ操作
export const storage = {
  setApiKeys: (keys: { openai?: string; elevenlabs?: string; claude?: string; gemini?: string }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('apiKeys', JSON.stringify(keys));
    }
  },

  getApiKeys: (): { openai?: string; elevenlabs?: string; claude?: string; gemini?: string } => {
    if (typeof window !== 'undefined') {
      const keys = localStorage.getItem('apiKeys');
      return keys ? JSON.parse(keys) : {};
    }
    return {};
  },

  clearApiKeys: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('apiKeys');
    }
  },

  setSubtitleSettings: (settings: SubtitleSettings) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('subtitleSettings', JSON.stringify(settings));
    }
  },

  getSubtitleSettings: (): SubtitleSettings => {
    if (typeof window !== 'undefined') {
      const settings = localStorage.getItem('subtitleSettings');
      if (!settings) {
        return DEFAULT_SUBTITLE_SETTINGS;
      }

      const parsed = JSON.parse(settings);

      // 古い形式（maxCharsPerLine, maxLinesが直接存在）を検出してマイグレーション
      if (parsed.maxCharsPerLine !== undefined && !parsed.en && !parsed.ja) {
        // 古い形式から新しい形式に変換
        const migrated: SubtitleSettings = {
          currentLanguage: parsed.language || 'en',
          en: {
            maxCharsPerLine: 42,
            maxLines: 2,
          },
          ja: {
            maxCharsPerLine: 13,
            maxLines: 2,
          },
          lineBreakService: parsed.lineBreakService || 'chatgpt',
        };
        // マイグレーションしたデータを保存
        localStorage.setItem('subtitleSettings', JSON.stringify(migrated));
        return migrated;
      }

      // 新しい形式の場合はそのまま返す（ただし欠けているプロパティがあればデフォルト値で補完）
      return {
        currentLanguage: parsed.currentLanguage || 'en',
        en: parsed.en || DEFAULT_SUBTITLE_SETTINGS.en,
        ja: parsed.ja || DEFAULT_SUBTITLE_SETTINGS.ja,
        lineBreakService: parsed.lineBreakService || 'chatgpt',
      };
    }
    return DEFAULT_SUBTITLE_SETTINGS;
  },

  clearSubtitleSettings: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('subtitleSettings');
    }
  },

  getDictionaries: (): any[] => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('dictionaries');
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  },

  setDictionaries: (dictionaries: any[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dictionaries', JSON.stringify(dictionaries));
    }
  },

  getDictionaryEntries: (dictionaryId: string): any[] => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`dictionary_entries_${dictionaryId}`);
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  },

  setDictionaryEntries: (dictionaryId: string, entries: any[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`dictionary_entries_${dictionaryId}`, JSON.stringify(entries));
    }
  },

  setAIPreferences: (preferences: AIPreferences) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('aiPreferences', JSON.stringify(preferences));
    }
  },

  getAIPreferences: (): AIPreferences => {
    if (typeof window !== 'undefined') {
      const prefs = localStorage.getItem('aiPreferences');
      return prefs ? JSON.parse(prefs) : DEFAULT_AI_PREFERENCES;
    }
    return DEFAULT_AI_PREFERENCES;
  },

  // プロジェクト管理関数
  getProjects: (): any[] => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('projects');
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  },

  setProjects: (projects: any[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('projects', JSON.stringify(projects));
    }
  },

  getCurrentProjectId: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('currentProjectId');
    }
    return null;
  },

  setCurrentProjectId: (projectId: string | null) => {
    if (typeof window !== 'undefined') {
      if (projectId) {
        localStorage.setItem('currentProjectId', projectId);
      } else {
        localStorage.removeItem('currentProjectId');
      }
    }
  },

  getProject: (projectId: string): any | null => {
    if (typeof window !== 'undefined') {
      const projects = storage.getProjects();
      return projects.find((p: any) => p.id === projectId) || null;
    }
    return null;
  },

  saveProject: (project: any) => {
    if (typeof window !== 'undefined') {
      const projects = storage.getProjects();
      const index = projects.findIndex((p: any) => p.id === project.id);

      const now = new Date().toISOString();
      const updatedProject = {
        ...project,
        updated_at: now,
        created_at: project.created_at || now,
      };

      if (index >= 0) {
        projects[index] = updatedProject;
      } else {
        projects.push(updatedProject);
      }

      storage.setProjects(projects);
    }
  },

  deleteProject: (projectId: string) => {
    if (typeof window !== 'undefined') {
      const projects = storage.getProjects();
      const filtered = projects.filter((p: any) => p.id !== projectId);
      storage.setProjects(filtered);

      // 現在のプロジェクトが削除された場合はクリア
      if (storage.getCurrentProjectId() === projectId) {
        storage.setCurrentProjectId(null);
      }
    }
  },
};
