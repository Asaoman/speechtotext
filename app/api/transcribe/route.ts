import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import axios from 'axios'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

// OpenAI Whisper APIで文字起こし
async function transcribeWithOpenAI(audioFile: File, apiKey: string) {
  const openai = new OpenAI({ apiKey })

  try {
    // FileオブジェクトをBlobに変換してOpenAI APIに渡す
    const arrayBuffer = await audioFile.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: audioFile.type })
    const file = new File([blob], audioFile.name, { type: audioFile.type })

    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
    })

    // レスポンスを共通フォーマットに変換
    return {
      text: response.text,
      language: response.language,
      segments: (response as any).segments?.map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })) || [],
      words: (response as any).words?.map((word: any) => ({
        word: word.word,
        start: word.start,
        end: word.end,
      })) || [],
    }
  } catch (error: any) {
    console.error('OpenAI API error details:', error)
    throw new Error(`OpenAI Whisper API error: ${error.message || 'Unknown error'}`)
  }
}

// ElevenLabs Scribe APIで文字起こし
async function transcribeWithElevenLabs(audioFile: File, apiKey: string, enableDiarization: boolean = false, numSpeakers?: number) {
  try {
    // ファイルをバッファに変換
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const formData = new FormData()
    formData.append('file', new Blob([buffer], { type: audioFile.type }), audioFile.name)
    formData.append('model_id', 'scribe_v1')
    formData.append('timestamps_granularity', 'word')
    if (enableDiarization) {
      formData.append('diarize', 'true')
      // 話者数を指定している場合（最大32名）
      if (numSpeakers && numSpeakers >= 2 && numSpeakers <= 32) {
        formData.append('num_speakers', numSpeakers.toString())
        console.log(`ElevenLabs: Requesting ${numSpeakers} speakers`)
      } else {
        console.log('ElevenLabs: Auto-detecting number of speakers')
      }
    }

    const response = await axios.post(
      'https://api.elevenlabs.io/v1/speech-to-text',
      formData,
      {
        headers: {
          'xi-api-key': apiKey,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    )

    const data = response.data

    console.log('=== ElevenLabs API Full Response ===')
    console.log(JSON.stringify(data, null, 2))
    console.log('=== Words structure ===')
    if (data.words && data.words.length > 0) {
      console.log('First word sample:', JSON.stringify(data.words[0], null, 2))
    }
    console.log('=== Segments structure ===')
    if (data.segments && data.segments.length > 0) {
      console.log('First segment sample:', JSON.stringify(data.segments[0], null, 2))
    }

    // wordsを処理（話者情報を含む）
    // 注意: ElevenLabsはspeaker_idという名前で返す
    // また、type="spacing"の空白要素は除外する
    const words = data.words
      ?.filter((word: any) => word.type !== 'spacing')  // spacing要素を除外
      .map((word: any) => ({
        word: word.word || word.text,
        start: word.start_time || word.start,
        end: word.end_time || word.end,
        speaker: word.speaker_id || word.speaker,  // speaker_idを優先
      })) || []

    // segmentsを処理または生成
    let segments = []

    if (data.segments && data.segments.length > 0) {
      // APIがsegmentsを返す場合
      segments = data.segments.map((seg: any) => ({
        start: seg.start_time || seg.start,
        end: seg.end_time || seg.end,
        text: seg.text,
        speaker: seg.speaker_id || seg.speaker,  // speaker_idを優先
      }))
    } else if (words.length > 0) {
      // wordsから話者ごとにセグメントを生成
      console.log('Generating segments from words...')
      let currentSegment: any = {
        start: words[0].start,
        text: '',
        speaker: words[0].speaker,
      }

      for (let i = 0; i < words.length; i++) {
        const word = words[i]

        // ワード間にスペースを追加（最初のワード以外）
        if (currentSegment.text.length > 0) {
          currentSegment.text += ' '
        }
        currentSegment.text += word.word

        // 次のワードがないか、話者が変わる場合、またはポーズが長い場合にセグメントを区切る
        const isLastWord = i === words.length - 1
        const speakerChanged = !isLastWord && word.speaker !== words[i + 1].speaker
        const longPause = !isLastWord && words[i + 1].start - word.end > 1.0

        if (isLastWord || speakerChanged || longPause) {
          currentSegment.end = word.end
          segments.push({ ...currentSegment })

          if (!isLastWord) {
            currentSegment = {
              start: words[i + 1].start,
              text: '',
              speaker: words[i + 1].speaker,
            }
          }
        }
      }
      console.log(`Generated ${segments.length} segments from ${words.length} words`)
    }

    // レスポンスを共通フォーマットに変換
    return {
      text: data.text || data.transcript || '',
      language: data.language || 'ja',
      segments,
      words,
    }
  } catch (error: any) {
    console.error('ElevenLabs API error details:', error.response?.data || error)
    throw new Error(`ElevenLabs Scribe API error: ${error.response?.data?.detail?.message || error.response?.data?.message || error.message || 'Unknown error'}`)
  }
}

// WhisperXで文字起こし（ローカル処理）
async function transcribeWithWhisperX(audioFile: File, enableDiarization: boolean = false, numSpeakers?: number) {
  // 一時ファイルに保存
  const tempDir = os.tmpdir()
  const tempFilePath = path.join(tempDir, `audio_${Date.now()}_${audioFile.name}`)

  try {
    // ファイルを一時ディレクトリに保存
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    fs.writeFileSync(tempFilePath, buffer)

    // Pythonスクリプトのパスを解決
    const scriptPath = path.join(process.cwd(), 'scripts', 'whisperx_transcribe.py')

    // スクリプトの存在確認
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`WhisperX script not found at: ${scriptPath}`)
    }

    console.log('Running WhisperX with script:', scriptPath)
    console.log('Audio file path:', tempFilePath)
    console.log('Diarization enabled:', enableDiarization)
    if (enableDiarization && numSpeakers) {
      console.log('Number of speakers:', numSpeakers)
    }

    // Pythonスクリプトを実行（UTF-8エンコーディングを指定）
    let diarizeFlags = ''
    if (enableDiarization) {
      diarizeFlags = '--diarize'
      if (numSpeakers && numSpeakers >= 2) {
        diarizeFlags += ` --num-speakers ${numSpeakers}`
      }
    }
    const { stdout, stderr } = await execAsync(`python "${scriptPath}" "${tempFilePath}" ${diarizeFlags}`, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    if (stderr) {
      console.warn('WhisperX stderr:', stderr)
    }

    if (!stdout) {
      throw new Error('No output from WhisperX script')
    }

    // stdoutから最後のJSON行を抽出（ログメッセージを除外）
    let result
    try {
      // stdoutを行分割して、最後の{で始まる行を探す
      const lines = stdout.trim().split('\n')
      let jsonLine = ''

      // 最後から検索して最初の{で始まる行を見つける
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim()
        if (line.startsWith('{')) {
          jsonLine = line
          break
        }
      }

      if (!jsonLine) {
        console.error('No JSON found in WhisperX output:', stdout)
        throw new Error('No JSON found in WhisperX output')
      }

      result = JSON.parse(jsonLine)
    } catch (parseError) {
      console.error('Failed to parse WhisperX output:', stdout)
      console.error('Parse error:', parseError)
      throw new Error('Invalid JSON response from WhisperX')
    }

    if (result.error) {
      throw new Error(result.error)
    }

    return result
  } catch (error: any) {
    console.error('WhisperX error details:', error)
    throw new Error(`WhisperX error: ${error.message || 'Unknown error'}`)
  } finally {
    // 一時ファイルを削除
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath)
      }
    } catch (e) {
      console.error('Failed to delete temp file:', e)
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const service = formData.get('service') as string
    const apiKey = formData.get('apiKey') as string
    const diarization = formData.get('diarization') === 'true'
    const numSpeakersStr = formData.get('numSpeakers') as string | null
    const numSpeakers = numSpeakersStr ? parseInt(numSpeakersStr, 10) : undefined

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      )
    }

    if (!service || !['openai', 'elevenlabs', 'whisperx'].includes(service)) {
      return NextResponse.json(
        { error: 'Invalid service specified' },
        { status: 400 }
      )
    }

    // WhisperX以外の場合はAPIキーが必要
    if (service !== 'whisperx' && !apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      )
    }

    let result

    if (service === 'whisperx') {
      result = await transcribeWithWhisperX(audioFile, diarization, numSpeakers)
    } else if (service === 'openai') {
      result = await transcribeWithOpenAI(audioFile, apiKey)
    } else {
      result = await transcribeWithElevenLabs(audioFile, apiKey, diarization, numSpeakers)
    }

    console.log('=== API ROUTE: Transcription completed ===')
    console.log('Result has text:', !!result.text)
    console.log('Text length:', result.text?.length || 0)
    console.log('Has segments:', !!result.segments)
    console.log('Segments count:', result.segments?.length || 0)
    console.log('Full result structure:', Object.keys(result))

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error.message || 'Transcription failed' },
      { status: 500 }
    )
  }
}
