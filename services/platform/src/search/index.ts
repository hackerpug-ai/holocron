/**
 * Platform search helpers — RRF hybrid (passages) + inline-HNSW surfaces.
 *
 * search-3 / CAP-EMB-01
 */

export {
  EMBEDDING_DIM,
  type EmbedFn,
  RRF_K,
  type RrfHybridSearchOptions,
  type RrfHybridSearchResult,
  type RrfSearchResultItem,
  rrfHybridSearch,
} from './rrf';

export {
  INLINE_HNSW_SURFACES,
  type InlineHnswSurface,
  type SearchSurfaceOptions,
  type SearchSurfaceResult,
  type SurfaceSearchResultItem,
  searchSurface,
} from './surfaces';
