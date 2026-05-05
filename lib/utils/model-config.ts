import { useSettingsStore } from '@/lib/store/settings';
import {
  getThinkingConfigKey,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';

/**
 * Get current model configuration from settings store
 */
export function getCurrentModelConfig() {
  const { providerId, modelId, providersConfig, thinkingConfigs } = useSettingsStore.getState();
  const configuredDefaultModel = process.env.NEXT_PUBLIC_DEFAULT_MODEL;
  const defaultColonIndex = configuredDefaultModel?.indexOf(':') ?? -1;
  const defaultProviderId =
    defaultColonIndex > 0
      ? (configuredDefaultModel!.slice(0, defaultColonIndex) as typeof providerId)
      : undefined;
  const defaultModelId =
    defaultColonIndex > 0 ? configuredDefaultModel!.slice(defaultColonIndex + 1) : undefined;
  const shouldUseConfiguredDefault =
    !!defaultProviderId && !!defaultModelId && !!providersConfig[defaultProviderId];

  const effectiveProviderId = shouldUseConfiguredDefault ? defaultProviderId : providerId;
  const effectiveModelId = shouldUseConfiguredDefault ? defaultModelId : modelId;
  const modelString = `${effectiveProviderId}:${effectiveModelId}`;

  // Get current provider's config
  const providerConfig = providersConfig[effectiveProviderId];
  const modelInfo = providerConfig?.models.find((model) => model.id === effectiveModelId);
  const thinking = modelInfo?.capabilities?.thinking;
  const thinkingConfig = supportsConfigurableThinking(thinking)
    ? normalizeThinkingConfig(
        thinking,
        thinkingConfigs[getThinkingConfigKey(effectiveProviderId, effectiveModelId)],
      )
    : undefined;

  return {
    providerId: effectiveProviderId,
    modelId: effectiveModelId,
    modelString,
    apiKey: providerConfig?.apiKey || '',
    baseUrl: providerConfig?.baseUrl || '',
    providerType: providerConfig?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
    thinkingConfig,
  };
}
