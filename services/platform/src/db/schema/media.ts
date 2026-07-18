/**
 * media group — audio/video transcripts + jobs + file_objects (replaces Convex _storage)
 */

import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  timestamptz,
  typedJsonb,
  updatedAtColumn,
} from '../columns';
import { sqlInList, workStatusValues } from '../enums';

export const fileObjects = pgTable(
  'file_objects',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    /** Content-addressed blob key (sha256 hex). */
    contentHash: text('content_hash').notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size'),
    storagePath: text('storage_path'),
    originalName: text('original_name'),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('file_objects', t.legacyConvexId),
    uniqueIndex('file_objects_content_hash_uidx').on(t.contentHash),
  ]
);

export const audioJobs = pgTable(
  'audio_jobs',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    documentId: text('document_id'),
    voiceId: text('voice_id'),
    status: text('status').notNull().default('pending'),
    totalSegments: integer('total_segments'),
    completedSegments: integer('completed_segments'),
    failedSegments: integer('failed_segments'),
    errorMessage: text('error_message'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('audio_jobs', t.legacyConvexId),
    check('audio_jobs_status_check', sql`status IN (${sql.raw(sqlInList(workStatusValues))})`),
  ]
);

export const audioSegments = pgTable(
  'audio_segments',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    documentId: text('document_id'),
    paragraphIndex: integer('paragraph_index'),
    paragraphHash: text('paragraph_hash'),
    blobId: text('blob_id'),
    fileObjectId: text('file_object_id'),
    status: text('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    voiceId: text('voice_id'),
    durationMs: integer('duration_ms'),
    jobId: text('job_id'),
    retryCount: integer('retry_count').default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('audio_segments', t.legacyConvexId),
    check('audio_segments_status_check', sql`status IN (${sql.raw(sqlInList(workStatusValues))})`),
  ]
);

export const videoTranscripts = pgTable(
  'video_transcripts',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    contentId: text('content_id'),
    sourceUrl: text('source_url'),
    transcriptType: text('transcript_type'),
    transcriptSource: text('transcript_source'),
    blobId: text('blob_id'),
    fileObjectId: text('file_object_id'),
    previewText: text('preview_text'),
    wordCount: integer('word_count'),
    durationMs: integer('duration_ms'),
    language: text('language'),
    metadataJson: typedJsonb('metadata_json'),
    generatedAt: timestamptz('generated_at'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('video_transcripts', t.legacyConvexId)]
);

export const transcriptJobs = pgTable(
  'transcript_jobs',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    contentId: text('content_id'),
    sourceUrl: text('source_url'),
    status: text('status').notNull().default('pending'),
    priority: integer('priority'),
    retryCount: integer('retry_count').default(0),
    errorMessage: text('error_message'),
    transcriptId: text('transcript_id'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('transcript_jobs', t.legacyConvexId),
    check('transcript_jobs_status_check', sql`status IN (${sql.raw(sqlInList(workStatusValues))})`),
  ]
);

export const audioTranscripts = pgTable(
  'audio_transcripts',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    contentId: text('content_id'),
    sourceUrl: text('source_url'),
    transcriptType: text('transcript_type'),
    transcriptSource: text('transcript_source'),
    blobId: text('blob_id'),
    fileObjectId: text('file_object_id'),
    previewText: text('preview_text'),
    wordCount: integer('word_count'),
    durationMs: integer('duration_ms'),
    language: text('language'),
    metadataJson: typedJsonb('metadata_json'),
    generatedAt: timestamptz('generated_at'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('audio_transcripts', t.legacyConvexId)]
);

export const audioTranscriptJobs = pgTable(
  'audio_transcript_jobs',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    contentId: text('content_id'),
    sourceUrl: text('source_url'),
    platform: text('platform'),
    status: text('status').notNull().default('pending'),
    priority: integer('priority'),
    retryCount: integer('retry_count').default(0),
    errorMessage: text('error_message'),
    transcriptId: text('transcript_id'),
    audioStorageId: text('audio_storage_id'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('audio_transcript_jobs', t.legacyConvexId),
    check(
      'audio_transcript_jobs_status_check',
      sql`status IN (${sql.raw(sqlInList(workStatusValues))})`
    ),
  ]
);
