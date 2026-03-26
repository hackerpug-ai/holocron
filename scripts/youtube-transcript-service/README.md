# YouTube Transcript Microservice

Python Flask microservice that fetches YouTube transcripts using the `youtube-transcript-api` library.

## Why This Exists

The Convex transcript system uses Jina Reader as a fallback, which is being blocked by YouTube's bot protection. This service uses the `youtube-transcript-api` Python library, which accesses different YouTube endpoints that aren't subject to the same bot detection.

## Installation

```bash
cd scripts/youtube-transcript-service
pip install -r requirements.txt
```

## Running

### Development
```bash
python service.py
# Service runs on http://localhost:5001
```

### Production (with gunicorn)
```bash
gunicorn -w 4 -b 0.0.0.0:5001 service:app
```

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{"status": "healthy"}
```

### GET /transcript/<video_id>
Fetch transcript for a single video.

**Example:**
```bash
curl http://localhost:5001/transcript/dQw4w9WgXcQ
```

**Response (Success):**
```json
{
  "success": true,
  "video_id": "dQw4w9WgXcQ",
  "transcript": "Full transcript text here...",
  "metadata": {
    "word_count": 1234,
    "char_count": 5678,
    "preview": "First 500 characters...",
    "entry_count": 42
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "No captions available for this video",
  "video_id": "dQw4w9WgXcQ"
}
```

### POST /transcript
Fetch transcripts for multiple videos (batch).

**Body:**
```json
{
  "video_ids": ["dQw4w9WgXcQ", "another_video_id"]
}
```

**Response:**
```json
{
  "results": [
    {
      "video_id": "dQw4w9WgXcQ",
      "success": true,
      "transcript": "...",
      "metadata": {...}
    },
    {
      "video_id": "another_video_id",
      "success": false,
      "error": "No captions available"
    }
  ]
}
```

## Integration with Convex

The Convex backend can call this service as an alternative to Jina Reader when YouTube API fails. Update `convex/transcripts/internal.ts` to add a new fallback method that calls this microservice.

## Environment Variables

Optional:
- `PORT`: Port to run on (default: 5001)
- `LOG_LEVEL`: Logging level (default: INFO)
