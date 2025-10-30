#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WhisperXを使用した音声文字起こしスクリプト
Next.js API Routeから呼び出されます
"""

import sys
import json
import os
import io
import argparse
import whisperx
import torch
import logging
import warnings

# UTF-8エンコーディングを強制
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# WhisperXのログをstderrにリダイレクト
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

# 警告もstderrに
warnings.filterwarnings('default')
logging.captureWarnings(True)

def transcribe_with_whisperx(audio_path, enable_diarization=False):
    """WhisperXで音声を文字起こし"""
    try:
        # デバイス設定
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "float32"

        # モデルロード（言語は自動検出）
        model = whisperx.load_model("base", device, compute_type=compute_type)

        # 音声ロード
        audio = whisperx.load_audio(audio_path)

        # 文字起こし（言語は自動検出）
        result = model.transcribe(audio, batch_size=16)

        # 話者分離を有効にした場合
        if enable_diarization:
            try:
                logging.info("話者分離を実行中...")

                # アライメント（話者分離の前に推奨）
                model_a, metadata = whisperx.load_align_model(
                    language_code=result["language"],
                    device=device
                )
                result = whisperx.align(
                    result["segments"],
                    model_a,
                    metadata,
                    audio,
                    device,
                    return_char_alignments=False
                )

                # 話者分離の実行
                # 注意: pyannote.audioの使用にはHugging Face トークンが必要です
                hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
                diarize_model = whisperx.DiarizationPipeline(
                    use_auth_token=hf_token,
                    device=device
                )
                diarize_segments = diarize_model(audio)
                result = whisperx.assign_word_speakers(diarize_segments, result)

                logging.info("話者分離完了")
            except Exception as e:
                logging.warning(f"話者分離に失敗しました: {str(e)}")
                logging.warning("話者分離にはHugging Faceトークンが必要です。")
                # 話者分離に失敗しても文字起こし結果は保持

        # セグメントからテキストを結合
        full_text = ""
        segments_data = []

        if "segments" in result:
            for seg in result["segments"]:
                seg_text = seg.get("text", "").strip()
                if seg_text:
                    full_text += seg_text + " "

                seg_data = {
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 0),
                    "text": seg_text
                }

                # 話者情報があれば追加
                if "speaker" in seg:
                    seg_data["speaker"] = seg["speaker"]

                segments_data.append(seg_data)

        # 結果を共通フォーマットに変換
        output = {
            "text": full_text.strip(),
            "language": result.get("language"),
            "segments": segments_data,
            "words": []
        }

        # ワード情報（存在する場合）
        if "words" in result:
            for word in result["words"]:
                word_data = {
                    "word": word.get("word", ""),
                    "start": word.get("start", 0),
                    "end": word.get("end", 0)
                }

                # 話者情報があれば追加
                if "speaker" in word:
                    word_data["speaker"] = word["speaker"]

                output["words"].append(word_data)

        return output

    except Exception as e:
        raise Exception(f"WhisperX transcription error: {str(e)}")

def main():
    """メイン処理"""
    parser = argparse.ArgumentParser(description='WhisperX音声文字起こし')
    parser.add_argument('audio_path', help='音声ファイルのパス')
    parser.add_argument('--diarize', action='store_true', help='話者分離を有効にする')

    args = parser.parse_args()

    if not os.path.exists(args.audio_path):
        print(json.dumps({"error": f"Audio file not found: {args.audio_path}"}), file=sys.stderr)
        sys.exit(1)

    try:
        result = transcribe_with_whisperx(args.audio_path, enable_diarization=args.diarize)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
