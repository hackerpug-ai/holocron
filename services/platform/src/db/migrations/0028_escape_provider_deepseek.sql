-- 0028_escape_provider_deepseek.sql
-- Repoint the budgeted escape hatch from Anthropic to DeepSeek.
-- The inference_telemetry.provider CHECK constraint previously allowed only
-- ('fleet', 'anthropic'); the escape now records provider='deepseek', so widen
-- the constraint. Existing historical rows (provider='anthropic') are unaffected
-- (CHECK applies on INSERT/UPDATE only).
ALTER TABLE "inference_telemetry"
  DROP CONSTRAINT IF EXISTS "inference_telemetry_provider_check";

ALTER TABLE "inference_telemetry"
  ADD CONSTRAINT "inference_telemetry_provider_check"
  CHECK (provider IN ('fleet', 'deepseek'));
