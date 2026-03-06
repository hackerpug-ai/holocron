# Holocron CLI

Command-line interface for interacting with the Holocron knowledge database via Convex backend.

## Features

- **Search**: Hybrid search (vector + full-text) across documents
- **List**: Browse documents with optional filtering
- **Get**: Retrieve specific documents by ID
- **Stats**: View database statistics
- **Browse**: Interactive document browser

## Installation

### Development Installation

```bash
cd cli
pip install -e ".[dev]"
```

### Production Installation

```bash
cd cli
pip install .
```

## Configuration

The CLI requires the following environment variable:

```bash
export CONVEX_URL="https://your-deployment.convex.cloud"
```

Optional environment variables:

```bash
export LOG_LEVEL="INFO"  # DEBUG, INFO, WARNING, ERROR
export OUTPUT_FORMAT="text"  # text, json, yaml
```

## Usage

### Search Documents

```bash
holocron search "react hooks" --limit 10
```

### List Documents

```bash
# List all documents
holocron list

# Filter by category
holocron list --category "research" --limit 20
```

### Get Specific Document

```bash
holocron get <document-id>
```

### View Statistics

```bash
holocron stats
```

### Interactive Browse

```bash
# Browse all documents
holocron browse

# Browse by category
holocron browse --category "tutorials"
```

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=holocron_cli --cov-report=html

# Run specific test file
pytest tests/unit/test_cli.py
```

### Code Quality

```bash
# Format code
black holocron_cli tests

# Lint code
ruff holocron_cli tests

# Type checking
mypy holocron_cli
```

## Architecture

```
cli/
├── holocron_cli/           # Main package
│   ├── __init__.py        # Package initialization
│   ├── __main__.py        # Module entry point
│   ├── cli.py             # CLI entry point and router
│   ├── commands/          # Command handlers
│   │   ├── search.py      # Search command
│   │   ├── list_docs.py   # List command
│   │   ├── get_doc.py     # Get command
│   │   ├── stats.py       # Stats command
│   │   └── browse.py      # Browse command
│   ├── core/              # Core functionality
│   │   ├── convex_client.py  # Convex HTTP client wrapper
│   │   └── config.py         # Configuration management
│   └── utils/             # Utilities
│       └── formatters.py  # Output formatting
├── tests/                 # Test suite
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── pyproject.toml        # Project metadata and dependencies
└── README.md             # This file
```

## Implementation Status

**Phase**: COMPLETE (Migration from Supabase to Convex)

All CLI commands have been migrated to use Convex:

- ✅ **US-061**: Convex installed and `ConvexHttpClient` configured
- ✅ **US-062**: All skill commands migrated to Convex queries
- ✅ **US-063**: Supabase dependencies removed

### Completed Features

1. ✅ Convex HTTP client wrapper (`holocron_cli/core/convex_client.py`)
2. ✅ Search command with hybrid search support
3. ✅ List command with filtering
4. ✅ Get document command
5. ✅ Stats command for database metrics
6. ✅ Browse command for interactive document viewing

### Migration Benefits

- Unified API with React Native mobile app
- Type-safe queries from Convex schema
- Better error handling and logging
- Simplified authentication (no separate CLI credentials)

## License

MIT
