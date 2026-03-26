#!/usr/bin/env python3
"""
YouTube Transcript Microservice
Fetches transcripts using youtube-transcript-api library
Bypasses YouTube's bot protection that blocks HTTP-based scrapers
"""

from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'}), 200


@app.route('/transcript/<video_id>', methods=['GET'])
def get_transcript(video_id):
    """
    Fetch transcript for a YouTube video

    Args:
        video_id: YouTube video ID (e.g., 'dQw4w9WgXcQ')

    Returns:
        JSON with transcript data or error message
    """
    try:
        # Create API instance and fetch transcript
        api = YouTubeTranscriptApi()
        transcript_list = api.fetch(video_id)

        # Format as plain text
        formatter = TextFormatter()
        text = formatter.format_transcript(transcript_list)

        # Calculate metadata
        word_count = len(text.split())
        preview = text[:500] if len(text) > 500 else text

        logger.info(f"Fetched transcript for {video_id}: {word_count} words, {len(text)} chars")

        return jsonify({
            'success': True,
            'video_id': video_id,
            'transcript': text,
            'metadata': {
                'word_count': word_count,
                'char_count': len(text),
                'preview': preview,
                'entry_count': len(transcript_list)
            }
        }), 200

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to fetch transcript for {video_id}: {error_msg}")

        # Check for specific error types
        if 'transcripts' in error_msg.lower() or 'Unable to retrieve a transcript' in error_msg:
            return jsonify({
                'success': False,
                'error': 'No captions available for this video',
                'video_id': video_id
            }), 404

        if 'Unauthorized' in error_msg or 'forbidden' in error_msg.lower():
            return jsonify({
                'success': False,
                'error': 'Access forbidden - video may be private',
                'video_id': video_id
            }), 403

        return jsonify({
            'success': False,
            'error': error_msg,
            'video_id': video_id
        }), 500


@app.route('/transcript', methods=['POST'])
def get_transcripts_batch():
    """
    Fetch transcripts for multiple YouTube videos

    Body:
        video_ids: list of YouTube video IDs

    Returns:
        JSON with batch results
    """
    data = request.get_json()
    video_ids = data.get('video_ids', [])

    if not video_ids:
        return jsonify({'success': False, 'error': 'No video IDs provided'}), 400

    api = YouTubeTranscriptApi()
    formatter = TextFormatter()
    results = []

    for video_id in video_ids:
        try:
            transcript_list = api.fetch(video_id)
            text = formatter.format_transcript(transcript_list)

            results.append({
                'video_id': video_id,
                'success': True,
                'transcript': text,
                'metadata': {
                    'word_count': len(text.split()),
                    'char_count': len(text)
                }
            })
        except Exception as e:
            results.append({
                'video_id': video_id,
                'success': False,
                'error': str(e)
            })

    return jsonify({'results': results}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
