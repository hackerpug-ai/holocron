# @holocron/web

Private workspace placeholder for the future Holocron web client.

This package intentionally contains no application source. Later tasks will land
the real web surface here after mobile/platform/mcp/docs-reader moves complete.

The `@holocron/web-runtime` alias dependency exists only so `pnpm list -r --depth 0`
emits this empty workspace member (and so `--parseable` paths include the
`@holocron/web` substring under pnpm 9.15.4). It is not product code.
