/**
 * Image upload lifecycle for improvements (S-UPLOAD-01).
 *
 * ONE state machine: idle → preview → uploading → success | error
 * Success is ONLY after finalize completes (anti-stub).
 * Protocol: POST /api/uploads → PUT → POST finalize (via uploadBlobThroughLifecycle).
 */

import { useCallback, useMemo, useState } from 'react';
import { type PlatformJson, uploadBlobThroughLifecycle } from '@/app/zero/platform';

export type ImageUploadPhase = 'idle' | 'preview' | 'uploading' | 'success' | 'error';

export type ImageDimensions = { width: number; height: number };

export type ImageUploadResult = {
  fileObjectId: string;
  blobId: string;
  contentHash: string;
  uploadId: string;
  raw: PlatformJson;
};

export type ImageUploadMachineState = {
  phase: ImageUploadPhase;
  imageUri: string | null;
  error: string | null;
  dimensions: ImageDimensions | null;
  result: ImageUploadResult | null;
};

export type ImageUploadAction =
  | { type: 'reset' }
  | { type: 'attach'; uri: string; dimensions?: ImageDimensions | null }
  | { type: 'start_upload' }
  | { type: 'finalize_success'; result: ImageUploadResult }
  | { type: 'fail'; error: string }
  | { type: 'retry' };

export function initialImageUploadState(
  seed?: Partial<ImageUploadMachineState>
): ImageUploadMachineState {
  return {
    phase: seed?.phase ?? 'idle',
    imageUri: seed?.imageUri ?? null,
    error: seed?.error ?? null,
    dimensions: seed?.dimensions ?? null,
    result: seed?.result ?? null,
  };
}

/** Pure reducer for the improvements image-upload state machine. */
export function reduceImageUpload(
  state: ImageUploadMachineState,
  action: ImageUploadAction
): ImageUploadMachineState {
  switch (action.type) {
    case 'reset':
      return initialImageUploadState();
    case 'attach':
      return {
        ...state,
        phase: 'preview',
        imageUri: action.uri,
        dimensions: action.dimensions ?? state.dimensions,
        error: null,
        result: null,
      };
    case 'start_upload':
      return {
        ...state,
        phase: 'uploading',
        error: null,
      };
    case 'finalize_success':
      return {
        ...state,
        phase: 'success',
        error: null,
        result: action.result,
      };
    case 'fail':
      return {
        ...state,
        phase: 'error',
        error: action.error,
      };
    case 'retry':
      return {
        ...state,
        phase: 'uploading',
        error: null,
      };
    default:
      return state;
  }
}

export type UploadImprovementImageInput = {
  targetId: string;
  idempotencyKey: string;
  blob: Blob;
  mimeType?: string;
  originalName?: string;
};

/**
 * Run the authoritative content-addressed upload lifecycle for an improvement image.
 * Throws on any failure — callers map throws to the `error` phase (no orphan success).
 */
export async function uploadImprovementImage(
  input: UploadImprovementImageInput
): Promise<ImageUploadResult> {
  if (input.blob.size <= 0) {
    throw new Error('image upload rejected: empty blob');
  }

  const raw = await uploadBlobThroughLifecycle({
    kind: 'improvement_image',
    targetId: input.targetId,
    idempotencyKey: input.idempotencyKey,
    blob: input.blob,
    mimeType: input.mimeType || input.blob.type || 'image/jpeg',
    originalName: input.originalName ?? 'improvement-image',
  });

  const fileObjectId = String(raw.fileObjectId ?? raw.file_object_id ?? '');
  const blobId = String(raw.blobId ?? raw.blob_id ?? raw.contentHash ?? raw.content_hash ?? '');
  const contentHash = String(raw.contentHash ?? raw.content_hash ?? blobId);
  const uploadId = String(raw.uploadId ?? raw.upload_id ?? raw.id ?? '');

  if (!fileObjectId) {
    throw new Error('upload finalize returned no fileObjectId');
  }
  if (!contentHash || !/^[0-9a-f]{64}$/i.test(contentHash)) {
    throw new Error('upload finalize returned no content-addressed hash');
  }

  return {
    fileObjectId,
    blobId: blobId || contentHash,
    contentHash,
    uploadId,
    raw,
  };
}

export type UseImageUploadOptions = {
  initialUri?: string | null;
};

/**
 * React hook wrapping the pure state machine + lifecycle helper.
 * The improvements sheet owns ONE machine instance via this hook.
 */
export function useImageUpload(options: UseImageUploadOptions = {}) {
  const [state, setState] = useState<ImageUploadMachineState>(() =>
    initialImageUploadState(
      options.initialUri ? { phase: 'preview', imageUri: options.initialUri } : undefined
    )
  );

  const dispatch = useCallback((action: ImageUploadAction) => {
    setState((prev) => reduceImageUpload(prev, action));
  }, []);

  const attach = useCallback(
    (uri: string, dimensions?: ImageDimensions | null) => {
      dispatch({ type: 'attach', uri, dimensions: dimensions ?? null });
    },
    [dispatch]
  );

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, [dispatch]);

  const upload = useCallback(
    async (input: UploadImprovementImageInput) => {
      dispatch({ type: 'start_upload' });
      try {
        const result = await uploadImprovementImage(input);
        dispatch({ type: 'finalize_success', result });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Image upload failed.';
        dispatch({ type: 'fail', error: message });
        throw err;
      }
    },
    [dispatch]
  );

  const retry = useCallback(
    async (input: UploadImprovementImageInput) => {
      dispatch({ type: 'retry' });
      try {
        const result = await uploadImprovementImage(input);
        dispatch({ type: 'finalize_success', result });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Image upload failed.';
        dispatch({ type: 'fail', error: message });
        throw err;
      }
    },
    [dispatch]
  );

  return useMemo(
    () => ({
      state,
      phase: state.phase,
      imageUri: state.imageUri,
      error: state.error,
      dimensions: state.dimensions,
      result: state.result,
      dispatch,
      attach,
      reset,
      upload,
      retry,
    }),
    [state, dispatch, attach, reset, upload, retry]
  );
}
