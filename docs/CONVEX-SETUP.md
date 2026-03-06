# Convex Setup Guide

This guide walks you through setting up Convex as the backend for Holocron.

## What is Convex?

Convex is a backend-as-a-service platform that provides:
- Real-time database with automatic reactivity
- Serverless functions (queries, mutations, actions)
- Vector search capabilities
- Type-safe API generation
- Built-in observability dashboard

## Prerequisites

- Node.js 18+ installed
- pnpm package manager
- Convex account (free tier available)

## Step 1: Sign Up for Convex

1. Go to [convex.dev](https://www.convex.dev)
2. Click "Sign Up" or "Get Started"
3. Sign up with GitHub, Google, or email
4. Complete the onboarding flow

## Step 2: Install Convex CLI

The Convex CLI is already included in the project dependencies. No separate installation needed.

## Step 3: Initialize Convex Project

From your project root:

```bash
npx convex dev
```

This will:
1. Prompt you to log in (opens browser)
2. Ask you to create a new project or select existing
3. Generate a `.env.local` file with your `CONVEX_URL`
4. Deploy your schema to Convex
5. Start the Convex dev server

**Important**: Keep this terminal window open while developing. The Convex dev server watches for changes and automatically deploys updates.

## Step 4: Configure Environment Variables

Copy your `CONVEX_URL` from the terminal output (or from `.env.local`):

```bash
# Example output from npx convex dev:
✔ Deployment URL: https://thankful-swan-123.convex.cloud
```

Add it to your `.env` file:

```bash
# .env
EXPO_PUBLIC_CONVEX_URL="https://thankful-swan-123.convex.cloud"
```

**Note**: The `.env.local` file is for Convex dev server. The `.env` file is for Expo.

## Step 5: Verify Setup

Check that Convex is running:

1. Open the Convex dashboard: [https://dashboard.convex.dev](https://dashboard.convex.dev)
2. Select your project
3. Navigate to "Data" tab - you should see your 9 tables listed
4. Navigate to "Functions" tab - you should see deployed functions

## Step 6: Run the App

Start the Expo dev server in a new terminal:

```bash
pnpm start
```

The app should connect to Convex and display your data.

## Convex Dashboard Overview

### Data Tab
View and edit your database tables:
- Browse all documents, conversations, etc.
- Run manual queries
- Export data as JSON

### Functions Tab
View deployed functions:
- Queries (read operations)
- Mutations (write operations)
- Actions (external API calls)
- View function code and logs

### Logs Tab
Real-time function execution logs:
- Function calls with arguments
- Execution time
- Errors and stack traces
- Query results

### Deployments Tab
Deployment history:
- Schema changes
- Function updates
- Rollback to previous versions

## Schema Structure

Holocron uses 9 Convex tables:

```typescript
// Core tables
conversations       // Chat conversation threads
chatMessages        // Individual messages

// Document management
documents           // Knowledge base with vector embeddings (1536d)

// Task management
tasks               // Background jobs and workflows

// Research workflows
researchSessions    // Basic research sessions
researchIterations  // Research iteration results

// Deep research (multi-agent)
deepResearchSessions    // Deep research sessions
deepResearchIterations  // Deep research iterations
citations              // Source citations
```

See [convex/schema.ts](../convex/schema.ts) for complete schema definitions.

## Common Convex Patterns

### Reactive Queries (Auto-updating)

```typescript
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

function MyComponent() {
  // Automatically updates when data changes
  const conversations = useQuery(api.conversations.queries.list)

  return (
    <View>
      {conversations?.map(conv => (
        <Text key={conv._id}>{conv.title}</Text>
      ))}
    </View>
  )
}
```

### Mutations (Write Operations)

```typescript
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

function CreateButton() {
  const create = useMutation(api.conversations.mutations.create)

  const handlePress = async () => {
    const id = await create({ title: 'New Chat' })
    console.log('Created:', id)
  }

  return <Button onPress={handlePress} title="Create" />
}
```

### Actions (External APIs)

```typescript
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'

function ChatInput() {
  const sendMessage = useAction(api.chat.send.send)

  const handleSend = async (text) => {
    await sendMessage({
      conversationId,
      content: text
    })
  }

  return <TextInput onSubmit={handleSend} />
}
```

## Development Workflow

### 1. Making Schema Changes

Edit `convex/schema.ts`:

```typescript
// Add a new field to conversations table
conversations: defineTable({
  title: v.string(),
  lastMessagePreview: v.optional(v.string()),
  archived: v.boolean(),  // NEW FIELD
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

The Convex dev server will automatically:
1. Detect the change
2. Deploy the new schema
3. Update TypeScript types
4. Restart the dev server

### 2. Adding New Functions

Create a new file in `convex/`:

```typescript
// convex/myFeature/queries.ts
import { query } from './_generated/server'
import { v } from 'convex/values'

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('myTable').collect()
  }
})

export const get = query({
  args: { id: v.id('myTable') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  }
})
```

Use it in your React components:

```typescript
import { api } from '@/convex/_generated/api'

const items = useQuery(api.myFeature.queries.list)
const item = useQuery(api.myFeature.queries.get, { id })
```

### 3. Debugging

**View logs in real-time**:
```bash
# In the terminal running npx convex dev
# All console.log() calls appear here
```

**Use Convex Dashboard**:
1. Go to "Logs" tab
2. Filter by function name
3. See arguments, results, and execution time

**Add logging to functions**:
```typescript
export const myQuery = query({
  args: { id: v.id('table') },
  handler: async (ctx, args) => {
    console.log('myQuery called with:', args)
    const result = await ctx.db.get(args.id)
    console.log('myQuery result:', result)
    return result
  }
})
```

## Troubleshooting

### "Cannot connect to Convex"

**Check**:
1. Is `npx convex dev` running?
2. Is `EXPO_PUBLIC_CONVEX_URL` set in `.env`?
3. Is the URL correct (format: `https://PROJECT.convex.cloud`)?

**Solution**:
```bash
# Restart Convex dev server
npx convex dev

# Verify URL in terminal output
# Copy URL to .env file
```

### "Function not found"

**Check**:
1. Did you save the function file?
2. Is the Convex dev server running?
3. Did the deployment succeed?

**Solution**:
```bash
# Check for TypeScript errors in terminal
# Fix any errors and save again
```

### "Schema validation error"

**Check**:
1. Does your data match the schema types?
2. Are required fields missing?

**Solution**:
```typescript
// Check schema definition
// Ensure all required fields are provided
// Use v.optional() for optional fields
```

### "Type errors in generated API"

**Check**:
1. Did the schema deploy successfully?
2. Are the generated types up to date?

**Solution**:
```bash
# Regenerate types
npx convex dev

# If that doesn't work, restart TypeScript server in editor
```

## Production Deployment

### 1. Create Production Deployment

```bash
npx convex deploy --prod
```

This creates a separate production deployment with its own URL.

### 2. Set Production URL

```bash
# .env.production
EXPO_PUBLIC_CONVEX_URL="https://your-prod-project.convex.cloud"
```

### 3. Configure Secrets

Set environment variables in Convex dashboard:
1. Go to "Settings" → "Environment Variables"
2. Add `OPENAI_API_KEY`, `LANGFUSE_SECRET_KEY`, etc.
3. These are available in Actions via `process.env`

### 4. Deploy App

```bash
# Build and deploy your Expo app
eas build --platform all
```

## Migration from Supabase

If you're migrating from the old Supabase backend:

1. All data has been migrated ✅
2. All functions have been ported ✅
3. All hooks have been updated ✅
4. Supabase dependencies removed ✅

**Key Changes**:
- `useQuery()` from `convex/react` (not React Query)
- `useMutation()` from `convex/react`
- `useAction()` for external API calls
- No manual subscription management needed
- Direct entity watching instead of `useLongRunningTask`

See [Migration Summary](../.spec/MIGRATION-SUMMARY.md) for details.

## Resources

- [Convex Documentation](https://docs.convex.dev)
- [React Hooks Guide](https://docs.convex.dev/client/react)
- [Schema Design](https://docs.convex.dev/database/schemas)
- [Vector Search](https://docs.convex.dev/database/vector-search)
- [Background Jobs](https://stack.convex.dev/background-job-management)

## Support

For Convex-related questions:
- [Convex Discord](https://convex.dev/community)
- [Convex GitHub Discussions](https://github.com/get-convex/convex-backend/discussions)
- [Convex Documentation](https://docs.convex.dev)

For Holocron-specific issues:
- Check migration documentation in `.spec/`
- Review Convex function implementations in `convex/`
- Check test files in `tests/convex/`
