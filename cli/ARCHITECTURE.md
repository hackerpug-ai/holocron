# Holocron CLI Architecture

## Overview

The Holocron CLI is a Python-based command-line tool for interacting with the Convex backend knowledge database. It follows Python best practices for CLI tool development with clear separation of concerns.

## Architecture Principles

1. **Command Pattern**: Each CLI command is a separate module with its own `execute()` function
2. **Singleton Client**: Convex HTTP client is managed as a singleton to avoid multiple connections
3. **Dependency Injection**: Commands receive parsed arguments and use shared client instance
4. **Testability**: All components are designed for unit and integration testing
5. **Type Safety**: Full type hints for better IDE support and error catching

## Directory Structure

```
cli/
├── holocron_cli/              # Main package
│   ├── cli.py                # Entry point, argument parsing, command dispatch
│   ├── commands/             # Command implementations (one per command)
│   ├── core/                 # Core functionality (client, config)
│   └── utils/                # Shared utilities (formatters, helpers)
└── tests/                    # Test suite (unit + integration)
```

## Component Responsibilities

### cli.py (Router)
- Parse command-line arguments
- Dispatch to appropriate command handler
- Handle global error catching
- No business logic (orchestration only)

### commands/ (Handlers)
- Implement individual command logic
- Call Convex client methods
- Format and display results
- Handle command-specific errors
- Each command exports `execute(args) -> int` function

### core/convex_client.py (Client)
- Singleton Convex HTTP client wrapper
- Environment variable configuration
- Query execution
- Connection management

### core/config.py (Configuration)
- Environment variable loading
- Configuration validation
- Settings dataclass

### utils/formatters.py (Output)
- Text formatting
- JSON formatting
- YAML formatting (future)
- Consistent output styling

## Command Flow

```
User Input
    ↓
cli.py (parse args)
    ↓
create_parser()
    ↓
dispatch to command
    ↓
commands/[command].py
    ↓
get_client() (singleton)
    ↓
client.query(...)
    ↓
format results
    ↓
output to stdout
```

## Error Handling Strategy

1. **Environment Errors**: Caught in `get_client()`, raise clear ValueError
2. **Network Errors**: Will be caught in command handlers, display user-friendly message
3. **Data Errors**: Handled by Convex client, formatted for CLI output
4. **Argument Errors**: Handled by argparse, automatic help display

## Testing Strategy

### Unit Tests
- `test_cli.py`: Argument parsing, command dispatch
- `test_convex_client.py`: Client initialization, singleton behavior
- `test_formatters.py`: Output formatting logic
- `test_commands/*.py`: Individual command logic (mocked client)

### Integration Tests (Future)
- End-to-end command execution with real Convex instance
- Environment variable handling
- Network error scenarios
- Data validation

## Extension Points

### Adding a New Command

1. Create `holocron_cli/commands/new_command.py`
2. Implement `execute(args: Namespace) -> int`
3. Add command parser in `cli.py::create_parser()`
4. Add dispatch case in `cli.py::main()`
5. Export from `commands/__init__.py`
6. Write tests in `tests/unit/test_new_command.py`

### Adding New Output Format

1. Add format logic to `utils/formatters.py`
2. Add `--format` argument to parser
3. Update command handlers to respect format
4. Add tests for new format

### Adding Configuration Options

1. Add field to `Config` dataclass in `core/config.py`
2. Add environment variable support
3. Update documentation
4. Add tests

## Dependencies

### Production
- **convex**: Convex HTTP client for Node.js/Python (will be added in US-061)

### Development
- **pytest**: Testing framework
- **pytest-cov**: Coverage reporting
- **black**: Code formatting
- **ruff**: Fast linting
- **mypy**: Type checking

## Development Workflow

```bash
# Install in development mode
cd cli
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black holocron_cli tests

# Lint code
ruff holocron_cli tests

# Type check
mypy holocron_cli

# Run CLI
holocron search "test query"
# or
python -m holocron_cli search "test query"
```

## Current Status

**Phase**: Initial structure (US-753) ✅

- [x] Directory structure created
- [x] Command scaffolding implemented
- [x] Test framework set up
- [x] All files compile without errors
- [ ] Convex client integration (US-061)
- [ ] Command implementations (US-062)
- [ ] Supabase removal (US-063)

## Next Steps (US-061)

1. Install `convex` Python package
2. Replace `ConvexClient` placeholder with actual `ConvexHttpClient`
3. Implement query methods using Convex API
4. Add error handling for network issues
5. Write integration tests

## Design Decisions

### Why Singleton Client?
- Avoid multiple HTTP connections
- Simplify testing with single mock point
- Match pattern from TypeScript migration scripts

### Why Command Pattern?
- Clear separation of concerns
- Easy to test individual commands
- Simple to add new commands
- Matches CLI best practices

### Why argparse over Click/Typer?
- Standard library (no dependencies)
- Sufficient for current needs
- Familiar to Python developers
- Easy migration to Click/Typer if needed

### Why pyproject.toml?
- Modern Python packaging standard
- Single source of truth for metadata
- Supports all development tools
- Future-proof

## References

- [US-061](../../../.spec/tasks/epic-6-deep-research-convex-migration/US-061.md): Install Convex in CLI
- [US-062](../../../.spec/tasks/epic-6-deep-research-convex-migration/US-062.md): Migrate commands
- [US-063](../../../.spec/tasks/epic-6-deep-research-convex-migration/US-063.md): Remove Supabase
- [Epic 6](../../../.spec/tasks/epic-6-deep-research-convex-migration/EPIC.md): Full epic context
