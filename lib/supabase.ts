import "expo-sqlite/localStorage/install";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/logger-client";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

// Public client with anon key (respects RLS)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Admin client with service role key (bypasses RLS) - for personal app direct access
export const supabaseAdmin: SupabaseClient = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : supabase;

// Valid document categories
export const VALID_CATEGORIES = [
  "architecture",
  "business",
  "competitors",
  "frameworks",
  "infrastructure",
  "libraries",
  "patterns",
  "platforms",
  "security",
  "research",
] as const;

export type DocumentCategory = (typeof VALID_CATEGORIES)[number];

// Document type
export interface Document {
  id: number;
  title: string;
  content: string;
  category: DocumentCategory;
  file_path?: string;
  file_type?: string;
  status?: string;
  date?: string;
  time?: string;
  research_type?: string;
  iterations?: number;
  created_at?: string;
  embedding?: string;
}

// Search result types
export interface SearchResult {
  id: number;
  title: string;
  category: string;
  content: string;
  score?: number;
  rank?: number;
  similarity?: number;
}

// ---------------------------------------------------------
// Search Functions (using PostgreSQL RPC)
// ---------------------------------------------------------

/**
 * Hybrid search combining FTS and vector similarity
 */
export async function searchHybrid(
  query: string,
  options: { limit?: number; category?: DocumentCategory } = {}
): Promise<SearchResult[]> {
  const { limit = 10, category } = options;

  // Get embedding from OpenAI
  const embedding = await generateEmbedding(query);

  const params: Record<string, unknown> = {
    query_text: query,
    query_embedding: embedding,
    match_count: limit,
  };

  if (category) {
    params.filter_category = category;
  }

  const { data, error } = await supabaseAdmin.rpc("hybrid_search", params);

  if (error) {
    log('supabase').error('Hybrid search failed', error, { query, limit, category });
    throw error;
  }
  return (data as SearchResult[]) || [];
}

/**
 * Full-text search using PostgreSQL tsvector
 */
export async function searchFTS(
  query: string,
  options: { limit?: number; category?: DocumentCategory } = {}
): Promise<SearchResult[]> {
  const { limit = 10, category } = options;

  const params: Record<string, unknown> = {
    query_text: query,
    match_count: limit,
  };

  if (category) {
    params.filter_category = category;
  }

  const { data, error } = await supabaseAdmin.rpc("search_fts", params);

  if (error) {
    log('supabase').error('FTS search failed', error, { query, limit, category });
    throw error;
  }
  return (data as SearchResult[]) || [];
}

/**
 * Pure vector/semantic search
 */
export async function searchVector(
  query: string,
  options: { limit?: number; category?: DocumentCategory } = {}
): Promise<SearchResult[]> {
  const { limit = 10, category } = options;

  const embedding = await generateEmbedding(query);

  const params: Record<string, unknown> = {
    query_embedding: embedding,
    match_count: limit,
  };

  if (category) {
    params.filter_category = category;
  }

  const { data, error } = await supabaseAdmin.rpc("search_vector", params);

  if (error) {
    log('supabase').error('Vector search failed', error, { query, limit, category });
    throw error;
  }
  return (data as SearchResult[]) || [];
}

// ---------------------------------------------------------
// Document CRUD Operations
// ---------------------------------------------------------

/**
 * Get a document by ID
 */
export async function getDocument(id: number): Promise<Document | null> {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    log('supabase').error('Get document failed', error, { id });
    throw error;
  }
  return data as Document;
}

/**
 * List documents with optional filtering
 */
export async function listDocuments(options: {
  category?: DocumentCategory;
  limit?: number;
  offset?: number;
} = {}): Promise<Document[]> {
  const { category, limit = 20, offset = 0 } = options;

  let query = supabaseAdmin
    .from("documents")
    .select("id, title, category, created_at, status");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    log('supabase').error('List documents failed', error, { category, limit, offset });
    throw error;
  }
  return (data as Document[]) || [];
}

/**
 * Create a new document
 */
export async function createDocument(doc: {
  title: string;
  content: string;
  category: DocumentCategory;
  file_path?: string;
  file_type?: string;
  status?: string;
  research_type?: string;
  iterations?: number;
}): Promise<Document> {
  const now = new Date();
  const embedding = await generateEmbedding(`${doc.title}\n\n${doc.content}`);

  const insertData = {
    ...doc,
    file_path:
      doc.file_path ||
      `archive/${doc.title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .slice(0, 50)}-${now.toISOString().slice(0, 10).replace(/-/g, "")}.md`,
    file_type: doc.file_type || "md",
    status: doc.status || "complete",
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    embedding: `[${embedding.join(",")}]`,
  };

  const { data: result, error } = await supabaseAdmin
    .from("documents")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    log('supabase').error('Create document failed', error, { title: doc.title, category: doc.category });
    throw error;
  }
  return result as Document;
}

/**
 * Update an existing document
 */
export async function updateDocument(
  id: number,
  updates: Partial<Omit<Document, "id">>
): Promise<Document> {
  // If content or title is updated, regenerate embedding
  const updateData: Record<string, unknown> = { ...updates };

  if (updates.content || updates.title) {
    const existing = await getDocument(id);
    if (existing) {
      const title = updates.title || existing.title;
      const content = updates.content || existing.content;
      const embedding = await generateEmbedding(`${title}\n\n${content}`);
      updateData.embedding = `[${embedding.join(",")}]`;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    log('supabase').error('Update document failed', error, { id, updates: Object.keys(updates) });
    throw error;
  }
  return data as Document;
}

/**
 * Delete a document
 */
export async function deleteDocument(id: number): Promise<void> {
  const { error } = await supabaseAdmin.from("documents").delete().eq("id", id);

  if (error) {
    log('supabase').error('Delete document failed', error, { id });
    throw error;
  }
}

// ---------------------------------------------------------
// Stats & Utilities
// ---------------------------------------------------------

/**
 * Get database statistics
 */
export async function getStats(): Promise<{
  total_documents: number;
  categories: Record<string, number>;
  recent_documents: Document[];
}> {
  // Total count
  const { count: total } = await supabaseAdmin
    .from("documents")
    .select("id", { count: "exact", head: true });

  // Category breakdown
  const categories: Record<string, number> = {};
  for (const cat of VALID_CATEGORIES) {
    const { count } = await supabaseAdmin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("category", cat);
    categories[cat] = count || 0;
  }

  // Recent documents
  const { data: recent } = await supabaseAdmin
    .from("documents")
    .select("id, title, category, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    total_documents: total || 0,
    categories,
    recent_documents: (recent as Document[]) || [],
  };
}

// ---------------------------------------------------------
// Embedding Generation
// ---------------------------------------------------------

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

/**
 * Generate embedding using OpenAI API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("EXPO_PUBLIC_OPENAI_API_KEY not set - required for vector search");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000), // Limit to ~8k chars
    }),
  });

  if (!response.ok) {
    log('supabase').error('OpenAI API error', { status: response.status, textLength: text.length });
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
