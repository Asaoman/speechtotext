import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const runtime = 'nodejs'
export const maxDuration = 60

interface OptimizeLineBreaksRequest {
  text: string
  maxCharsPerLine: number
  maxLines: number
  language: 'en' | 'ja'
  service: 'chatgpt' | 'claude' | 'gemini'
  apiKey: string
}

// ChatGPTで改行位置を最適化
async function optimizeWithChatGPT(text: string, maxCharsPerLine: number, maxLines: number, language: 'en' | 'ja', apiKey: string): Promise<string[]> {
  const openai = new OpenAI({ apiKey })

  const systemPrompt = language === 'en'
    ? `You are a professional subtitle editor following Netflix/BBC industry standards. Apply comprehensive subtitle creation methodology to optimize line breaks.

⚙️ CURRENT SETTINGS:
- Language: English
- Maximum characters per line: ${maxCharsPerLine}
- Maximum lines: ${maxLines}
- Target reading speed: 17-21 CPS (characters per second)
- Display time constraint: Minimum 1 second, maximum 7 seconds per subtitle

📐 LAYOUT & VISUAL BALANCE PRINCIPLES:
1. Prefer "bottom-heavy pyramid" shape (shorter top line, longer bottom line)
2. Aim for balanced line lengths (avoid one very short line with one very long line)
3. Distribute text evenly when creating 2-line subtitles
4. Maintain visual harmony and readability on screen
5. Consider viewer's natural eye movement (top-left to bottom-right)

📏 COMPREHENSIVE LINE BREAK RULES (Netflix/BBC Standards):

Priority 1 - SENTENCE BOUNDARIES:
• Break at sentence boundaries (periods, question marks, exclamation marks)
• Keep complete sentences together when possible
• Avoid splitting sentences unless necessary for length constraints

Priority 2 - PUNCTUATION:
• Break AFTER commas, semicolons, colons when creating natural pauses
• Break AFTER closing quotation marks when they end clauses
• Keep opening quotation marks with the following text

Priority 3 - CONJUNCTIONS & LOGICAL CONNECTORS:
• Break BEFORE coordinating conjunctions: and, but, or, so, yet, for, nor
• Break BEFORE subordinating conjunctions: because, although, while, if, when, since, unless
• Keep conjunctions with the clause they introduce

Priority 4 - PREPOSITIONS:
• Break BEFORE prepositions when they start new prepositional phrases: at, by, for, from, in, of, on, to, with, about, after, before, between, during, through, under
• Keep prepositions with their objects

Priority 5 - ARTICLES & DETERMINERS (NEVER BREAK):
• NEVER break after articles: a, an, the
• NEVER break after possessive pronouns: my, your, his, her, its, our, their
• NEVER break after demonstratives: this, that, these, those
• Always keep determiners with the nouns they modify

Priority 6 - GRAMMATICAL UNITS TO PRESERVE:
• NEVER break between subject and verb
• NEVER break between verb and direct object
• NEVER break between auxiliary verbs and main verbs (is going, have been, will do)
• NEVER break between adjectives and the nouns they modify
• NEVER break between adverbs and the verbs/adjectives they modify
• Keep compound verbs together (phrasal verbs: take off, give up, look after)
• Keep titles with names (Mr. Smith, Dr. Jones, President Lincoln)
• Keep numbers with their units (25 years, $100, 3 meters)

Priority 7 - PHRASES TO KEEP TOGETHER:
• Keep noun phrases intact (the big red house, a cup of coffee)
• Keep verb phrases intact (has been working, will have completed)
• Keep prepositional phrases together when short (in the house, at noon)
• Keep common expressions intact (in fact, on the other hand, as a result)
• Keep time expressions together (at 3 o'clock, on Monday morning)

Priority 8 - PROPER NOUNS & NAMES:
• Keep full names together (John Smith, New York City)
• Keep geographical names intact (United States of America)
• Keep organization names together (United Nations, Microsoft Corporation)

🔤 HANDLING LONG WORDS & HYPHENATION:
• If a single word exceeds ${maxCharsPerLine} characters, use hyphenation
• Break at syllable boundaries following English phonetics
• Always place hyphen (-) at END of first line
• Examples: "extra-ordinary", "unfor-tunately", "repre-sentation", "inter-national"
• Consult common hyphenation points: un-believable, pre-historic, re-consider
• Avoid creating orphaned syllables (prefer "wonder-ful" over "wonderf-ul")

📊 READABILITY PRIORITY HIERARCHY:
1. Grammatical correctness and natural phrasing (highest priority)
2. Visual balance and aesthetic layout
3. Character count constraints (${maxCharsPerLine} chars/line)
4. Line count constraints (${maxLines} lines max)
5. Reading speed optimization (17-21 CPS target)

⚠️ CRITICAL CONSTRAINTS:
• Each line MUST NOT exceed ${maxCharsPerLine} characters
• Total lines MUST NOT exceed ${maxLines}
• Maintain semantic meaning and grammatical integrity
• Prioritize viewer comprehension over rigid formatting

OUTPUT FORMAT:
Return ONLY the optimized text lines separated by newline characters.
No explanations, no numbering, no markdown - just the text with line breaks.`
    : `あなたはプロの字幕エディターです。日本映画字幕協会・Netflix・NHK放送基準を完全に遵守し、多角的検証を経て最適な改行位置を決定してください。

⚙️ 現在の設定:
- 言語: 日本語
- 1行の最大文字数: ${maxCharsPerLine}文字
- 最大行数: ${maxLines}行
- 目標読取速度: 4-5文字/秒 (日本語標準)
- 表示時間制約: 最短1秒、最長7秒/字幕

🚫 絶対遵守事項（CRITICAL - 違反厳禁）:

【1】疑問符・感嘆符の絶対保持
• 「？」「！」「!」「?」は絶対に削除しない
• 「どこに行くの？」→ 正解：「どこに行くの？」 / 誤り：「どこに行くの」
• 「すごい！」→ 正解：「すごい！」 / 誤り：「すごい」
• 全角・半角どちらも保持する

【2】文の途中で改行しない（NEVER MID-SENTENCE BREAKS）
• 完結した文・節の単位でのみ改行する
• 主語と述語を分断しない
• 修飾語と被修飾語を分断しない

❌ 悪い例：「私は明日」「学校に行く」→ 主語と述語が分断
⭕ 良い例：「私は明日学校に行く」or「明日 学校に行くよ」

【3】助詞から始めない（絶対禁止）
• 助詞（は が を に へ と から より で や の も ばかり だけ まで さえ こそ しか ほど くらい など）で行を開始しない

❌ 悪い例：「彼」「は優しい」
⭕ 良い例：「彼は優しい」

【4】接続詞・接続助詞の処理
• 接続詞（しかし そして また それで だから でも すると では そこで ところが けれども ただし つまり なぜなら 例えば）は次の節とセット

📐 改行位置の優先順位（上から順に検討）:

【優先度1】文の完結点（スコア100）
• 句点の後（削除する）
• 疑問符・感嘆符の後
• 例：「今日は晴れだ」→ で終了、次の文は新しい行

【優先度2】接続詞の前（スコア90）
• 「しかし」「そして」「また」「それで」「だから」「でも」の前
• 例：「雨だった でも行った」

【優先度3】引用・会話の区切り（スコア85）
• 「と言った」「と思った」の後
• 「〜」（波ダッシュ）の前後

【優先度4】接続助詞の前（スコア70-80）
• 「〜て」「〜で」の後（意味のまとまり優先）
• 「〜けど」「〜から」「〜ので」「〜のに」の前

【優先度5】読点の位置（スコア60）
• 元の読点位置（半角スペース）
• ただし意味のまとまりを優先

【優先度6】文節の切れ目（スコア50）
• 主語・述語の単位で分割
• ただし主語と述語は極力同じ行に

【禁止事項】以下の位置では絶対に改行しない:
• 助詞の前後 / 名詞と助詞の間 / 形容詞と名詞の間 / 副詞と動詞の間
• 連体修飾節の途中 / 数量表現の途中 / 固有名詞の途中 / 複合動詞の途中

🔍 多角的検証基準（以下すべてをクリアすること）:

【検証1】文法的正確性 → 主語・述語・修飾語の関係保持 / 助詞の適切配置
【検証2】意味の明確性 → 各行単独で意味理解可能 / 誤解を生む改行なし
【検証3】視覚的バランス → 極端な長短なし / 上下の文字数バランス適切
【検証4】読み取りやすさ → 自然なポーズ位置 / 違和感なし
【検証5】レギュレーション準拠 → 各行${maxCharsPerLine}文字以下 / 合計${maxLines}行以下

句読点処理:
• 句読点（「、」「。」）使用しない（既に処理済み）
• 読点→半角スペース / 句点→削除
• 疑問符（？!）・感嘆符（！!）絶対保持
• 日本語文字はスペースなしで連続

🔤 長い単語処理:
• ${maxCharsPerLine}文字超過時のみ分割
• カタカナ語は音節で分割
• 長音（ー）・中点（・）の後で改行可
• 意味が通じる位置で分割

📊 最終チェックリスト（出力前に必ず確認）:
✓ 疑問符・感嘆符保持？ / ✓ 助詞で行開始なし？ / ✓ 文途中改行なし？
✓ 主語述語分断なし？ / ✓ 各行${maxCharsPerLine}文字以下？ / ✓ 合計${maxLines}行以下？
✓ 意味まとまり保持？ / ✓ 視覚的バランス適切？

出力形式:
改行位置を最適化したテキストのみを返してください。
説明や番号は不要です。改行文字で行を区切ってください。
疑問符・感嘆符は絶対に保持してください。`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.3,
  })

  const optimizedText = response.choices[0].message.content || text
  return optimizedText.split('\n').filter(line => line.trim() !== '')
}

// Claudeで改行位置を最適化
async function optimizeWithClaude(text: string, maxCharsPerLine: number, maxLines: number, language: 'en' | 'ja', apiKey: string): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = language === 'en'
    ? `You are a professional subtitle editor following Netflix/BBC industry standards. Apply comprehensive subtitle creation methodology to optimize line breaks.

⚙️ CURRENT SETTINGS:
- Language: English
- Maximum characters per line: ${maxCharsPerLine}
- Maximum lines: ${maxLines}
- Target reading speed: 17-21 CPS (characters per second)
- Display time constraint: Minimum 1 second, maximum 7 seconds per subtitle

📐 LAYOUT & VISUAL BALANCE PRINCIPLES:
1. Prefer "bottom-heavy pyramid" shape (shorter top line, longer bottom line)
2. Aim for balanced line lengths (avoid one very short line with one very long line)
3. Distribute text evenly when creating 2-line subtitles
4. Maintain visual harmony and readability on screen
5. Consider viewer's natural eye movement (top-left to bottom-right)

📏 COMPREHENSIVE LINE BREAK RULES (Netflix/BBC Standards):

Priority 1 - SENTENCE BOUNDARIES:
• Break at sentence boundaries (periods, question marks, exclamation marks)
• Keep complete sentences together when possible
• Avoid splitting sentences unless necessary for length constraints

Priority 2 - PUNCTUATION:
• Break AFTER commas, semicolons, colons when creating natural pauses
• Break AFTER closing quotation marks when they end clauses
• Keep opening quotation marks with the following text

Priority 3 - CONJUNCTIONS & LOGICAL CONNECTORS:
• Break BEFORE coordinating conjunctions: and, but, or, so, yet, for, nor
• Break BEFORE subordinating conjunctions: because, although, while, if, when, since, unless
• Keep conjunctions with the clause they introduce

Priority 4 - PREPOSITIONS:
• Break BEFORE prepositions when they start new prepositional phrases: at, by, for, from, in, of, on, to, with, about, after, before, between, during, through, under
• Keep prepositions with their objects

Priority 5 - ARTICLES & DETERMINERS (NEVER BREAK):
• NEVER break after articles: a, an, the
• NEVER break after possessive pronouns: my, your, his, her, its, our, their
• NEVER break after demonstratives: this, that, these, those
• Always keep determiners with the nouns they modify

Priority 6 - GRAMMATICAL UNITS TO PRESERVE:
• NEVER break between subject and verb
• NEVER break between verb and direct object
• NEVER break between auxiliary verbs and main verbs (is going, have been, will do)
• NEVER break between adjectives and the nouns they modify
• NEVER break between adverbs and the verbs/adjectives they modify
• Keep compound verbs together (phrasal verbs: take off, give up, look after)
• Keep titles with names (Mr. Smith, Dr. Jones, President Lincoln)
• Keep numbers with their units (25 years, $100, 3 meters)

Priority 7 - PHRASES TO KEEP TOGETHER:
• Keep noun phrases intact (the big red house, a cup of coffee)
• Keep verb phrases intact (has been working, will have completed)
• Keep prepositional phrases together when short (in the house, at noon)
• Keep common expressions intact (in fact, on the other hand, as a result)
• Keep time expressions together (at 3 o'clock, on Monday morning)

Priority 8 - PROPER NOUNS & NAMES:
• Keep full names together (John Smith, New York City)
• Keep geographical names intact (United States of America)
• Keep organization names together (United Nations, Microsoft Corporation)

🔤 HANDLING LONG WORDS & HYPHENATION:
• If a single word exceeds ${maxCharsPerLine} characters, use hyphenation
• Break at syllable boundaries following English phonetics
• Always place hyphen (-) at END of first line
• Examples: "extra-ordinary", "unfor-tunately", "repre-sentation", "inter-national"
• Consult common hyphenation points: un-believable, pre-historic, re-consider
• Avoid creating orphaned syllables (prefer "wonder-ful" over "wonderf-ul")

📊 READABILITY PRIORITY HIERARCHY:
1. Grammatical correctness and natural phrasing (highest priority)
2. Visual balance and aesthetic layout
3. Character count constraints (${maxCharsPerLine} chars/line)
4. Line count constraints (${maxLines} lines max)
5. Reading speed optimization (17-21 CPS target)

⚠️ CRITICAL CONSTRAINTS:
• Each line MUST NOT exceed ${maxCharsPerLine} characters
• Total lines MUST NOT exceed ${maxLines}
• Maintain semantic meaning and grammatical integrity
• Prioritize viewer comprehension over rigid formatting

OUTPUT FORMAT:
Return ONLY the optimized text lines separated by newline characters.
No explanations, no numbering, no markdown - just the text with line breaks.`
    : `あなたはプロの字幕エディターです。業界標準の字幕作成手法を適用し、最適な改行位置を決定してください。

⚙️ 現在の設定:
- 言語: 日本語
- 1行の最大文字数: ${maxCharsPerLine}文字
- 最大行数: ${maxLines}行
- 目標読取速度: 4-5文字/秒 (日本語標準)
- 表示時間制約: 最短1秒、最長7秒/字幕

🚫 絶対遵守事項（CRITICAL - 違反厳禁）:

【1】疑問符・感嘆符の絶対保持
• 「？」「！」「!」「?」は絶対に削除しない
• 「どこに行くの？」→ 正解：「どこに行くの？」 / 誤り：「どこに行くの」
• 「すごい！」→ 正解：「すごい！」 / 誤り：「すごい」
• 全角・半角どちらも保持する

【2】文の途中で改行しない（NEVER MID-SENTENCE BREAKS）
• 完結した文・節の単位でのみ改行する
• 主語と述語を分断しない
• 修飾語と被修飾語を分断しない

❌ 悪い例：「私は明日」「学校に行く」→ 主語と述語が分断
⭕ 良い例：「私は明日学校に行く」or「明日 学校に行くよ」

【3】助詞から始めない（絶対禁止）
• 助詞（は が を に へ と から より で や の も ばかり だけ まで さえ こそ しか ほど くらい など）で行を開始しない

❌ 悪い例：「彼」「は優しい」
⭕ 良い例：「彼は優しい」

【4】接続詞・接続助詞の処理
• 接続詞（しかし そして また それで だから でも すると では そこで ところが けれども ただし つまり なぜなら 例えば）は次の節とセット

📐 改行位置の優先順位（上から順に検討）:

【優先度1】文の完結点（スコア100）
• 句点の後（削除する）
• 疑問符・感嘆符の後
• 例：「今日は晴れだ」→ で終了、次の文は新しい行

【優先度2】接続詞の前（スコア90）
• 「しかし」「そして」「また」「それで」「だから」「でも」の前
• 例：「雨だった でも行った」

【優先度3】引用・会話の区切り（スコア85）
• 「と言った」「と思った」の後
• 「〜」（波ダッシュ）の前後

【優先度4】接続助詞の前（スコア70-80）
• 「〜て」「〜で」の後（意味のまとまり優先）
• 「〜けど」「〜から」「〜ので」「〜のに」の前

【優先度5】読点の位置（スコア60）
• 元の読点位置（半角スペース）
• ただし意味のまとまりを優先

【優先度6】文節の切れ目（スコア50）
• 主語・述語の単位で分割
• ただし主語と述語は極力同じ行に

【禁止事項】以下の位置では絶対に改行しない:
• 助詞の前後 / 名詞と助詞の間 / 形容詞と名詞の間 / 副詞と動詞の間
• 連体修飾節の途中 / 数量表現の途中 / 固有名詞の途中 / 複合動詞の途中

🔍 多角的検証基準（以下すべてをクリアすること）:

【検証1】文法的正確性 → 主語・述語・修飾語の関係保持 / 助詞の適切配置
【検証2】意味の明確性 → 各行単独で意味理解可能 / 誤解を生む改行なし
【検証3】視覚的バランス → 極端な長短なし / 上下の文字数バランス適切
【検証4】読み取りやすさ → 自然なポーズ位置 / 違和感なし
【検証5】レギュレーション準拠 → 各行${maxCharsPerLine}文字以下 / 合計${maxLines}行以下

句読点処理:
• 句読点（「、」「。」）使用しない（既に処理済み）
• 読点→半角スペース / 句点→削除
• 疑問符（？!）・感嘆符（！!）絶対保持
• 日本語文字はスペースなしで連続

🔤 長い単語処理:
• ${maxCharsPerLine}文字超過時のみ分割
• カタカナ語は音節で分割
• 長音（ー）・中点（・）の後で改行可
• 意味が通じる位置で分割

📊 最終チェックリスト（出力前に必ず確認）:
✓ 疑問符・感嘆符保持？ / ✓ 助詞で行開始なし？ / ✓ 文途中改行なし？
✓ 主語述語分断なし？ / ✓ 各行${maxCharsPerLine}文字以下？ / ✓ 合計${maxLines}行以下？
✓ 意味まとまり保持？ / ✓ 視覚的バランス適切？

出力形式:
改行位置を最適化したテキストのみを返してください。
説明や番号は不要です。改行文字で行を区切ってください。
疑問符・感嘆符は絶対に保持してください。`

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    temperature: 0.3,
    system: systemPrompt,
    messages: [
      { role: 'user', content: text }
    ],
  })

  const optimizedText = response.content[0].type === 'text' ? response.content[0].text : text
  return optimizedText.split('\n').filter(line => line.trim() !== '')
}

// Geminiで改行位置を最適化
async function optimizeWithGemini(text: string, maxCharsPerLine: number, maxLines: number, language: 'en' | 'ja', apiKey: string): Promise<string[]> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const prompt = language === 'en'
    ? `You are a professional subtitle editor following Netflix/BBC industry standards. Apply comprehensive subtitle creation methodology to optimize line breaks.

⚙️ CURRENT SETTINGS:
- Language: English
- Maximum characters per line: ${maxCharsPerLine}
- Maximum lines: ${maxLines}
- Target reading speed: 17-21 CPS (characters per second)
- Display time constraint: Minimum 1 second, maximum 7 seconds per subtitle

📐 LAYOUT & VISUAL BALANCE PRINCIPLES:
1. Prefer "bottom-heavy pyramid" shape (shorter top line, longer bottom line)
2. Aim for balanced line lengths (avoid one very short line with one very long line)
3. Distribute text evenly when creating 2-line subtitles
4. Maintain visual harmony and readability on screen
5. Consider viewer's natural eye movement (top-left to bottom-right)

📏 COMPREHENSIVE LINE BREAK RULES (Netflix/BBC Standards):

Priority 1 - SENTENCE BOUNDARIES:
• Break at sentence boundaries (periods, question marks, exclamation marks)
• Keep complete sentences together when possible
• Avoid splitting sentences unless necessary for length constraints

Priority 2 - PUNCTUATION:
• Break AFTER commas, semicolons, colons when creating natural pauses
• Break AFTER closing quotation marks when they end clauses
• Keep opening quotation marks with the following text

Priority 3 - CONJUNCTIONS & LOGICAL CONNECTORS:
• Break BEFORE coordinating conjunctions: and, but, or, so, yet, for, nor
• Break BEFORE subordinating conjunctions: because, although, while, if, when, since, unless
• Keep conjunctions with the clause they introduce

Priority 4 - PREPOSITIONS:
• Break BEFORE prepositions when they start new prepositional phrases: at, by, for, from, in, of, on, to, with, about, after, before, between, during, through, under
• Keep prepositions with their objects

Priority 5 - ARTICLES & DETERMINERS (NEVER BREAK):
• NEVER break after articles: a, an, the
• NEVER break after possessive pronouns: my, your, his, her, its, our, their
• NEVER break after demonstratives: this, that, these, those
• Always keep determiners with the nouns they modify

Priority 6 - GRAMMATICAL UNITS TO PRESERVE:
• NEVER break between subject and verb
• NEVER break between verb and direct object
• NEVER break between auxiliary verbs and main verbs (is going, have been, will do)
• NEVER break between adjectives and the nouns they modify
• NEVER break between adverbs and the verbs/adjectives they modify
• Keep compound verbs together (phrasal verbs: take off, give up, look after)
• Keep titles with names (Mr. Smith, Dr. Jones, President Lincoln)
• Keep numbers with their units (25 years, $100, 3 meters)

Priority 7 - PHRASES TO KEEP TOGETHER:
• Keep noun phrases intact (the big red house, a cup of coffee)
• Keep verb phrases intact (has been working, will have completed)
• Keep prepositional phrases together when short (in the house, at noon)
• Keep common expressions intact (in fact, on the other hand, as a result)
• Keep time expressions together (at 3 o'clock, on Monday morning)

Priority 8 - PROPER NOUNS & NAMES:
• Keep full names together (John Smith, New York City)
• Keep geographical names intact (United States of America)
• Keep organization names together (United Nations, Microsoft Corporation)

🔤 HANDLING LONG WORDS & HYPHENATION:
• If a single word exceeds ${maxCharsPerLine} characters, use hyphenation
• Break at syllable boundaries following English phonetics
• Always place hyphen (-) at END of first line
• Examples: "extra-ordinary", "unfor-tunately", "repre-sentation", "inter-national"
• Consult common hyphenation points: un-believable, pre-historic, re-consider
• Avoid creating orphaned syllables (prefer "wonder-ful" over "wonderf-ul")

📊 READABILITY PRIORITY HIERARCHY:
1. Grammatical correctness and natural phrasing (highest priority)
2. Visual balance and aesthetic layout
3. Character count constraints (${maxCharsPerLine} chars/line)
4. Line count constraints (${maxLines} lines max)
5. Reading speed optimization (17-21 CPS target)

⚠️ CRITICAL CONSTRAINTS:
• Each line MUST NOT exceed ${maxCharsPerLine} characters
• Total lines MUST NOT exceed ${maxLines}
• Maintain semantic meaning and grammatical integrity
• Prioritize viewer comprehension over rigid formatting

OUTPUT FORMAT:
Return ONLY the optimized text lines separated by newline characters.
No explanations, no numbering, no markdown - just the text with line breaks.

Text to optimize:
${text}`
    : `あなたはプロの字幕エディターです。業界標準の字幕作成手法を適用し、最適な改行位置を決定してください。

⚙️ 現在の設定:
- 言語: 日本語
- 1行の最大文字数: ${maxCharsPerLine}文字
- 最大行数: ${maxLines}行
- 目標読取速度: 4-5文字/秒 (日本語標準)
- 表示時間制約: 最短1秒、最長7秒/字幕

📐 レイアウト・視覚バランスの原則:
1. 上下行の文字数をできるだけ均等に配分する
2. 極端に短い行と長い行の組み合わせを避ける
3. 2行字幕では視覚的なバランスを重視
4. 画面上での読みやすさと美しさを保つ
5. 視聴者の自然な視線移動（左上から右下）を考慮

📏 包括的な改行ルール（業界標準）:

優先度1 - 文の区切り:
• 文末（句点の位置）で改行することを優先
• 完結した文をできるだけ一緒に保つ
• 文の途中での改行は長さの制約がある場合のみ

優先度2 - 文節の区切り:
• 文節の切れ目で改行する（主語・述語・修飾語の単位）
• 「～は」「～が」「～を」「～に」などの格助詞の前で改行可能
• 「～して」「～ながら」などの接続助詞の前で改行可能

優先度3 - 助詞の扱い（絶対ルール）:
• 絶対に助詞から始めない：は、が、を、に、へ、と、から、より、で、や、の
• 助詞は必ず前の語とセットで配置
• 例：「私は」「学校に」「本を」は分割不可
• 格助詞・係助詞・副助詞すべてに適用

優先度4 - 意味のまとまりの保持:
• 主語と述語はできるだけ同じ字幕内に
• 修飾語と被修飾語を一緒に保つ
• 複合動詞を分割しない（例：「見て行く」「食べてしまう」）
• 慣用句・成句を保持（例：「一石二鳥」「十人十色」）
• 接続詞は後続の文節とセット（例：「しかし」「また」「そして」）

優先度5 - 保持すべき文法単位:
• 名詞＋助詞の組み合わせ（例：「友達と」「公園で」）
• 動詞の活用形＋助動詞（例：「行った」「食べている」「来るだろう」）
• 形容詞＋名詞（例：「美しい花」「大きな家」）
• 副詞＋動詞/形容詞（例：「とても好き」「少し寒い」）
• 連体修飾節全体（例：「昨日買った本」「彼が作った料理」）
• 数量表現（例：「3個」「100円」「5時間」）

優先度6 - 固有名詞・名前:
• 人名は分割しない（例：「山田太郎」「夏目漱石」）
• 地名は分割しない（例：「東京都渋谷区」「京都府」）
• 組織名・企業名を保持（例：「国際連合」「株式会社〇〇」）
• 作品名・書名を保持（例：「坊っちゃん」「風の谷のナウシカ」）

優先度7 - 特殊な表現:
• 敬語表現を保持（例：「いらっしゃいます」「ございます」）
• 時間表現を保持（例：「午後3時」「2024年1月1日」）
• 単位付き数値（例：「25歳」「100メートル」）

句読点とスペースの処理（重要）:
• 句読点（「、」「。」）は一切使用しない
• 元のテキストで「、」（読点）がある位置には半角スペース1つを入れる
• 「。」（句点）は削除し、スペースも入れない
• 単語間に不要なスペースを入れない
• 日本語の文字は基本的にスペースなしで連続させる
• カタカナ語の連続にもスペース不要
• 漢字・ひらがな・カタカナの境界にスペース不要

🔤 長い単語の処理:
• カタカナ語が${maxCharsPerLine}文字を超える場合、音節で分割
• 分割例：「インターナショナル」→「インター」/「ナショナル」
• 長音（ー）の後で改行可能：「コンピューター」→「コンピュー」/「ター」
• 中点（・）の後で改行可能：「ニューヨーク・タイムズ」
• 複合語は意味の区切りで分割：「国際連合事務総長」→「国際連合」/「事務総長」
• 英単語・外来語は音節・シラブルで分割
• できる限り意味が通じる位置で分割

📊 読みやすさの優先順位:
1. 文法的正確性と自然な日本語表現（最優先）
2. 意味のまとまりの保持
3. 視覚的バランスと美しいレイアウト
4. 文字数制約（${maxCharsPerLine}文字/行）
5. 行数制約（最大${maxLines}行）
6. 読取速度最適化（4-5文字/秒目標）

🎭 特殊な文体への対応:
• 方言・口語表現：自然な区切りを優先
• 詩的表現・文学的文章：韻律・リズムを考慮
• 専門用語：用語の完全性を保持
• 会話文：話し言葉の自然なポーズ位置で改行

⚠️ 絶対制約:
• 各行は${maxCharsPerLine}文字を超えてはならない
• 合計行数は${maxLines}行を超えてはならない
• 意味内容と文法的整合性を維持
• 視聴者の理解を最優先

出力形式:
改行位置を最適化したテキストのみを返してください。
説明や番号は不要です。改行文字で行を区切ってください。

最適化するテキスト:
${text}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
    },
  })

  const optimizedText = result.response.text() || text
  return optimizedText.split('\n').filter(line => line.trim() !== '')
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizeLineBreaksRequest = await request.json()
    const { text, maxCharsPerLine, maxLines, language, service, apiKey } = body

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    let lines: string[]

    if (service === 'chatgpt') {
      lines = await optimizeWithChatGPT(text, maxCharsPerLine, maxLines, language, apiKey)
    } else if (service === 'claude') {
      lines = await optimizeWithClaude(text, maxCharsPerLine, maxLines, language, apiKey)
    } else if (service === 'gemini') {
      lines = await optimizeWithGemini(text, maxCharsPerLine, maxLines, language, apiKey)
    } else {
      return NextResponse.json({ error: 'Invalid service' }, { status: 400 })
    }

    return NextResponse.json({ success: true, lines })
  } catch (error: any) {
    console.error('Line break optimization error:', error)
    return NextResponse.json(
      { error: error.message || 'Line break optimization failed' },
      { status: 500 }
    )
  }
}
