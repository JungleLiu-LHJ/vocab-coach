import type { OpenClawConfig } from "../config/config.js";
type ModelsConfig = NonNullable<OpenClawConfig["models"]>;
type ProviderConfig = NonNullable<ModelsConfig["providers"]>[string];
/**
 * Derive the Ollama native API base URL from a configured base URL.
 *
 * Users typically configure `baseUrl` with a `/v1` suffix (e.g.
 * `http://192.168.20.14:11434/v1`) for the OpenAI-compatible endpoint.
 * The native Ollama API lives at the root (e.g. `/api/tags`), so we
 * strip the `/v1` suffix when present.
 */
export declare function resolveOllamaApiBase(configuredBaseUrl?: string): string;
export declare function buildVeniceProvider(): Promise<ProviderConfig>;
export declare function buildOllamaProvider(configuredBaseUrl?: string, opts?: {
    quiet?: boolean;
}): Promise<ProviderConfig>;
export declare function buildHuggingfaceProvider(discoveryApiKey?: string): Promise<ProviderConfig>;
export declare function buildVercelAiGatewayProvider(): Promise<ProviderConfig>;
export declare function buildVllmProvider(params?: {
    baseUrl?: string;
    apiKey?: string;
}): Promise<ProviderConfig>;
/**
 * Build the Kilocode provider with dynamic model discovery from the gateway
 * API. Falls back to the static catalog on failure.
 */
export declare function buildKilocodeProviderWithDiscovery(): Promise<ProviderConfig>;
export {};
