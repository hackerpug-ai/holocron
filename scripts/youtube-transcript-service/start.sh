#!/bin/bash
# YouTube Transcript Service Start Script

cd "$(dirname "$0")"

# Activate virtual environment
source venv/bin/activate

# Start the service
echo "Starting YouTube Transcript Service on http://localhost:5001"
python service.py
