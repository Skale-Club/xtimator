/**
 * lib/ai/step-models.ts
 *
 * Per-step model resolution (Phase 4c). Reads the admin-configured
 * `ai_config.metadata.models` slots through platform-config (30 s cache) and
 * returns the slot's model ONLY when it passes the slot policy; otherwise the
 * caller's own default, so with nothing configured every call keeps the model
 * it has always used.
 *
 * Never throws: any read failure (no service client, DB error, a test mock
 * without the export) resolves to the fallback.
 */
import { pickSlotModel, type EscalationConfig, type ModelSlot } from './model-policy'

async function loadSettings() {
  const { getAiModelSettings } = await import('@/lib/platform-config')
  return getAiModelSettings()
}

/** The slot's validated model, or `fallback` (today's default for that call). */
export async function resolveSlotModel<F>(slot: ModelSlot, fallback: F): Promise<string | F> {
  try {
    const settings = await loadSettings()
    return pickSlotModel(settings.models, slot, fallback)
  } catch {
    return fallback
  }
}

/** The Opus escalation config, or null when disabled / invalid / unreadable. */
export async function getEscalationConfig(): Promise<EscalationConfig | null> {
  try {
    return (await loadSettings()).escalation
  } catch {
    return null
  }
}
