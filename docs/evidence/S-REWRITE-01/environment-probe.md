# S-REWRITE-01 environment probe (FIX rename menu)

## Date
2026-07-24T01:37:22Z

## MAESTRO_APP_ID
MAESTRO_APP_ID=com.holocron.app (com.holocron.app — NOT com.anonymous.holocron)

## Simulator / Maestro
== Devices ==
-- iOS 26.5 --
    iPhone 17 (C79BF38C-D353-46A2-A1ED-CCA6D68E1B04) (Booted) 
/opt/homebrew/bin/maestro

## Services
- :4111 health=200 status=404
- :8081 health=000000 status=000000
- :4848 health=000000 status=000000

## Seed
holo: unknown command: seed:e2e

## Code fix
- Long-press → onOpenConversationMenu → setActionMenuConversation + setIsActionMenuOpen(true)
- handleRename user-reachable via action-menu-rename-button
- Maestro oracles: 3 rows, Sprint Planning, >=3 bubbles, send, cancel
