#!/usr/bin/env node

// Simple script to apply migration using Supabase REST API
import { readFileSync } from 'fs'

async function applyMigration() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Read migration SQL
  const sql = readFileSync('supabase/migrations/20250302_create_conversations.sql', 'utf-8')

  // Use Supabase RPC to execute SQL
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({ sql })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Migration failed:', error)
    process.exit(1)
  }

  console.log('Migration applied successfully!')
}

applyMigration().catch(console.error)
