/**
 * CORS headers for Edge Functions
 *
 * Standard CORS configuration allowing all origins (*) for local development.
 * In production, this should be restricted to specific origins.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
