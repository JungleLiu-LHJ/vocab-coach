import { G as normalizeStringEntries, ot as DEFAULT_ACCOUNT_ID, st as normalizeAccountId } from "./run-with-concurrency-CF8VuJbn.js";
import "./paths-DinMprTu.js";
import { C as sleep } from "./logger-BMLgyw16.js";
import "./accounts-BGl_CN-A.js";
import { y as resolveToolsBySender } from "./thinking-iKJ_iGg6.js";
import { Mr as hasConfiguredSecretInput, N as MSTeamsConfigSchema, Nr as normalizeResolvedSecretInputString, Pr as normalizeSecretInputString, hn as withFileLock } from "./model-auth-XFaDx11U.js";
import "./plugins-DsJt7fJ_.js";
import "./accounts-BP6pa1Ll.js";
import "./send-Ba_S9lgg.js";
import { At as resolveSenderScopedGroupPolicy, Bt as resolveNestedAllowlistDecision, Lt as buildChannelKeyCandidates, Mt as resolveAllowlistProviderRuntimeGroupPolicy, Nt as resolveDefaultGroupPolicy, Rt as normalizeChannelSlug, kt as evaluateSenderGroupAccessForPolicy, zt as resolveChannelEntryMatchWithFallback } from "./send-DIBwtWJC.js";
import { $ as logTypingFailure, G as isDangerousNameMatchingEnabled, H as resolveEffectiveAllowFromLists, K as createTypingCallbacks, Q as logInboundDrop, R as formatDocsLink, V as resolveDmGroupAccessWithLists, W as DEFAULT_WEBHOOK_MAX_BODY_BYTES, X as buildMediaPayload, Z as resolveMentionGating, at as buildPendingHistoryContextFromMap, dt as resolveAllowlistMatchSimple, et as resolveControlCommandGate, m as resolveInboundSessionEnvelopeContext, n as dispatchReplyFromConfig, nt as summarizeMapping, ot as clearHistoryEntriesIfEnabled, q as createReplyPrefixOptions, rt as DEFAULT_GROUP_HISTORY_LIMIT, st as recordPendingHistoryEntryIfEnabled, t as withReplyDispatcher, tt as mergeAllowlist, ut as formatAllowlistMatchMeta, z as readStoreAllowFromForDmPolicy } from "./dispatch-CJdFmoH9.js";
import { i as isSilentReplyText, n as SILENT_REPLY_TOKEN } from "./tokens-DX0D7wcY.js";
import { j as resolveChannelMediaMaxBytes } from "./deliver-Cp8Cxh2Q.js";
import "./github-copilot-token-Cpk7my6q.js";
import { a as isPrivateIpAddress } from "./ssrf-DO4nukNa.js";
import { t as fetchWithSsrFGuard } from "./fetch-guard-DQjXnOj2.js";
import { S as getFileExtension, b as detectMime, x as extensionForMime } from "./message-channel-B0AAGrsT.js";
import "./path-alias-guards-Chm5u0m0.js";
import "./fs-safe-Bz2jHLW3.js";
import { r as extractOriginalFilename } from "./store-BjPGnmu2.js";
import { $ as readJsonFileWithFallback, et as writeJsonFileAtomically } from "./send-C9NpGj5T.js";
import "./local-roots-DK4-GSam.js";
import { _ as loadWebMedia } from "./ir-zNw6Of4b.js";
import "./pi-embedded-helpers-E84qlHCL.js";
import "./paths-DLwa5lSY.js";
import "./diagnostic-CWKOXNMa.js";
import "./pi-model-discovery-BDE0F1f3.js";
import "./audio-transcription-runner-CnIJrTWm.js";
import "./image-D0aMD6Gj.js";
import "./chrome-DuUe2cfN.js";
import "./skills-BKG9RF4P.js";
import "./redact-CuadQs4H.js";
import "./errors-aHHLVEoW.js";
import "./tool-images-CIpFsb0x.js";
import "./api-key-rotation-kzFbBdNN.js";
import "./proxy-fetch-DmIpD5u2.js";
import "./commands-registry-Bb0iV7qR.js";
import "./skill-commands-CBOxWoS0.js";
import "./render-hUn-4tdL.js";
import "./target-errors-CuMd12Ul.js";
import "./send-fN47TNhl.js";
import "./outbound-attachment-Bqfyoq_u.js";
import "./fetch-CUEducDz.js";
import "./send-QjzuArfi.js";
import "./sqlite-iYfpNaMx.js";
import "./channel-activity-CArz9dwZ.js";
import "./tables-DrXxcfAW.js";
import "./proxy-2Si8-2xo.js";
import "./manager-B0hUGeMe.js";
import { z } from "zod";
z.union([z.string(), z.number()]);
function buildChannelConfigSchema(schema) {
	const schemaWithJson = schema;
	if (typeof schemaWithJson.toJSONSchema === "function") return { schema: schemaWithJson.toJSONSchema({
		target: "draft-07",
		unrepresentable: "any"
	}) };
	return { schema: {
		type: "object",
		additionalProperties: true
	} };
}
//#endregion
//#region src/channels/plugins/onboarding/helpers.ts
function addWildcardAllowFrom(allowFrom) {
	const next = (allowFrom ?? []).map((v) => String(v).trim()).filter(Boolean);
	if (!next.includes("*")) next.push("*");
	return next;
}
function mergeAllowFromEntries(current, additions) {
	const merged = [...current ?? [], ...additions].map((v) => String(v).trim()).filter(Boolean);
	return [...new Set(merged)];
}
function splitOnboardingEntries(raw) {
	return raw.split(/[\n,;]+/g).map((entry) => entry.trim()).filter(Boolean);
}
function setTopLevelChannelAllowFrom(params) {
	const channelConfig = params.cfg.channels?.[params.channel] ?? {};
	return {
		...params.cfg,
		channels: {
			...params.cfg.channels,
			[params.channel]: {
				...channelConfig,
				...params.enabled ? { enabled: true } : {},
				allowFrom: params.allowFrom
			}
		}
	};
}
function setTopLevelChannelDmPolicyWithAllowFrom(params) {
	const channelConfig = params.cfg.channels?.[params.channel] ?? {};
	const existingAllowFrom = params.getAllowFrom?.(params.cfg) ?? channelConfig.allowFrom ?? void 0;
	const allowFrom = params.dmPolicy === "open" ? addWildcardAllowFrom(existingAllowFrom) : void 0;
	return {
		...params.cfg,
		channels: {
			...params.cfg.channels,
			[params.channel]: {
				...channelConfig,
				dmPolicy: params.dmPolicy,
				...allowFrom ? { allowFrom } : {}
			}
		}
	};
}
function setTopLevelChannelGroupPolicy(params) {
	const channelConfig = params.cfg.channels?.[params.channel] ?? {};
	return {
		...params.cfg,
		channels: {
			...params.cfg.channels,
			[params.channel]: {
				...channelConfig,
				...params.enabled ? { enabled: true } : {},
				groupPolicy: params.groupPolicy
			}
		}
	};
}
//#endregion
//#region src/channels/plugins/onboarding/channel-access.ts
function parseAllowlistEntries(raw) {
	return splitOnboardingEntries(String(raw ?? ""));
}
function formatAllowlistEntries(entries) {
	return entries.map((entry) => entry.trim()).filter(Boolean).join(", ");
}
async function promptChannelAccessPolicy(params) {
	const options = [{
		value: "allowlist",
		label: "Allowlist (recommended)"
	}];
	if (params.allowOpen !== false) options.push({
		value: "open",
		label: "Open (allow all channels)"
	});
	if (params.allowDisabled !== false) options.push({
		value: "disabled",
		label: "Disabled (block all channels)"
	});
	const initialValue = params.currentPolicy ?? "allowlist";
	return await params.prompter.select({
		message: `${params.label} access`,
		options,
		initialValue
	});
}
async function promptChannelAllowlist(params) {
	const initialValue = params.currentEntries && params.currentEntries.length > 0 ? formatAllowlistEntries(params.currentEntries) : void 0;
	return parseAllowlistEntries(await params.prompter.text({
		message: `${params.label} allowlist (comma-separated)`,
		placeholder: params.placeholder,
		initialValue
	}));
}
async function promptChannelAccessConfig(params) {
	const hasEntries = (params.currentEntries ?? []).length > 0;
	const shouldPrompt = params.defaultPrompt ?? !hasEntries;
	if (!await params.prompter.confirm({
		message: params.updatePrompt ? `Update ${params.label} access?` : `Configure ${params.label} access?`,
		initialValue: shouldPrompt
	})) return null;
	const policy = await promptChannelAccessPolicy({
		prompter: params.prompter,
		label: params.label,
		currentPolicy: params.currentPolicy,
		allowOpen: params.allowOpen,
		allowDisabled: params.allowDisabled
	});
	if (policy !== "allowlist") return {
		policy,
		entries: []
	};
	return {
		policy,
		entries: await promptChannelAllowlist({
			prompter: params.prompter,
			label: params.label,
			currentEntries: params.currentEntries,
			placeholder: params.placeholder
		})
	};
}
//#endregion
//#region src/channels/plugins/pairing-message.ts
const PAIRING_APPROVED_MESSAGE = "✅ OpenClaw access approved. Send a message to start chatting.";
//#endregion
//#region src/plugins/config-schema.ts
function error(message) {
	return {
		success: false,
		error: { issues: [{
			path: [],
			message
		}] }
	};
}
function emptyPluginConfigSchema() {
	return {
		safeParse(value) {
			if (value === void 0) return {
				success: true,
				data: void 0
			};
			if (!value || typeof value !== "object" || Array.isArray(value)) return error("expected config object");
			if (Object.keys(value).length > 0) return error("config must be empty");
			return {
				success: true,
				data: value
			};
		},
		jsonSchema: {
			type: "object",
			additionalProperties: false,
			properties: {}
		}
	};
}
//#endregion
//#region src/plugin-sdk/channel-lifecycle.ts
/**
* Keep a channel/provider task pending until the HTTP server closes.
*
* When an abort signal is provided, `onAbort` is invoked once and should
* trigger server shutdown. The returned promise resolves only after `close`.
*/
async function keepHttpServerTaskAlive(params) {
	const { server, abortSignal, onAbort } = params;
	let abortTask = Promise.resolve();
	let abortTriggered = false;
	const triggerAbort = () => {
		if (abortTriggered) return;
		abortTriggered = true;
		abortTask = Promise.resolve(onAbort?.()).then(() => void 0);
	};
	const onAbortSignal = () => {
		triggerAbort();
	};
	if (abortSignal) if (abortSignal.aborted) triggerAbort();
	else abortSignal.addEventListener("abort", onAbortSignal, { once: true });
	await new Promise((resolve) => {
		server.once("close", () => resolve());
	});
	if (abortSignal) abortSignal.removeEventListener("abort", onAbortSignal);
	await abortTask;
}
//#endregion
//#region src/plugin-sdk/inbound-reply-dispatch.ts
async function dispatchReplyFromConfigWithSettledDispatcher(params) {
	return await withReplyDispatcher({
		dispatcher: params.dispatcher,
		onSettled: params.onSettled,
		run: () => dispatchReplyFromConfig({
			ctx: params.ctxPayload,
			cfg: params.cfg,
			dispatcher: params.dispatcher,
			replyOptions: params.replyOptions
		})
	});
}
//#endregion
//#region src/plugin-sdk/outbound-media.ts
async function loadOutboundMediaFromUrl(mediaUrl, options = {}) {
	return await loadWebMedia(mediaUrl, {
		maxBytes: options.maxBytes,
		localRoots: options.mediaLocalRoots
	});
}
//#endregion
//#region src/plugin-sdk/pairing-access.ts
function createScopedPairingAccess(params) {
	const resolvedAccountId = normalizeAccountId(params.accountId);
	return {
		accountId: resolvedAccountId,
		readAllowFromStore: () => params.core.channel.pairing.readAllowFromStore({
			channel: params.channel,
			accountId: resolvedAccountId
		}),
		readStoreForDmPolicy: (provider, accountId) => params.core.channel.pairing.readAllowFromStore({
			channel: provider,
			accountId: normalizeAccountId(accountId)
		}),
		upsertPairingRequest: (input) => params.core.channel.pairing.upsertPairingRequest({
			channel: params.channel,
			accountId: resolvedAccountId,
			...input
		})
	};
}
//#endregion
//#region src/plugin-sdk/ssrf-policy.ts
function normalizeHostnameSuffix(value) {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return "";
	if (trimmed === "*" || trimmed === "*.") return "*";
	return trimmed.replace(/^\*\.?/, "").replace(/^\.+/, "").replace(/\.+$/, "");
}
function isHostnameAllowedBySuffixAllowlist(hostname, allowlist) {
	if (allowlist.includes("*")) return true;
	const normalized = hostname.toLowerCase();
	return allowlist.some((entry) => normalized === entry || normalized.endsWith(`.${entry}`));
}
function normalizeHostnameSuffixAllowlist(input, defaults) {
	const source = input && input.length > 0 ? input : defaults;
	if (!source || source.length === 0) return [];
	const normalized = source.map(normalizeHostnameSuffix).filter(Boolean);
	if (normalized.includes("*")) return ["*"];
	return Array.from(new Set(normalized));
}
function isHttpsUrlAllowedByHostnameSuffixAllowlist(url, allowlist) {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		return isHostnameAllowedBySuffixAllowlist(parsed.hostname, allowlist);
	} catch {
		return false;
	}
}
/**
* Converts suffix-style host allowlists (for example "example.com") into SSRF
* hostname allowlist patterns used by the shared fetch guard.
*
* Suffix semantics:
* - "example.com" allows "example.com" and "*.example.com"
* - "*" disables hostname allowlist restrictions
*/
function buildHostnameAllowlistPolicyFromSuffixAllowlist(allowHosts) {
	const normalizedAllowHosts = normalizeHostnameSuffixAllowlist(allowHosts);
	if (normalizedAllowHosts.length === 0) return;
	const patterns = /* @__PURE__ */ new Set();
	for (const normalized of normalizedAllowHosts) {
		if (normalized === "*") return;
		patterns.add(normalized);
		patterns.add(`*.${normalized}`);
	}
	if (patterns.size === 0) return;
	return { hostnameAllowlist: Array.from(patterns) };
}
//#endregion
//#region src/plugin-sdk/status-helpers.ts
function createDefaultChannelRuntimeState(accountId, extra) {
	return {
		accountId,
		running: false,
		lastStartAt: null,
		lastStopAt: null,
		lastError: null,
		...extra ?? {}
	};
}
function buildBaseChannelStatusSummary(snapshot) {
	return {
		configured: snapshot.configured ?? false,
		running: snapshot.running ?? false,
		lastStartAt: snapshot.lastStartAt ?? null,
		lastStopAt: snapshot.lastStopAt ?? null,
		lastError: snapshot.lastError ?? null
	};
}
function buildProbeChannelStatusSummary(snapshot, extra) {
	return {
		...buildBaseChannelStatusSummary(snapshot),
		...extra ?? {},
		probe: snapshot.probe,
		lastProbeAt: snapshot.lastProbeAt ?? null
	};
}
function buildRuntimeAccountStatusSnapshot(params) {
	const { runtime, probe } = params;
	return {
		running: runtime?.running ?? false,
		lastStartAt: runtime?.lastStartAt ?? null,
		lastStopAt: runtime?.lastStopAt ?? null,
		lastError: runtime?.lastError ?? null,
		probe
	};
}
//#endregion
export { DEFAULT_ACCOUNT_ID, DEFAULT_GROUP_HISTORY_LIMIT, DEFAULT_WEBHOOK_MAX_BODY_BYTES, MSTeamsConfigSchema, PAIRING_APPROVED_MESSAGE, SILENT_REPLY_TOKEN, addWildcardAllowFrom, buildBaseChannelStatusSummary, buildChannelConfigSchema, buildChannelKeyCandidates, buildHostnameAllowlistPolicyFromSuffixAllowlist, buildMediaPayload, buildPendingHistoryContextFromMap, buildProbeChannelStatusSummary, buildRuntimeAccountStatusSnapshot, clearHistoryEntriesIfEnabled, createDefaultChannelRuntimeState, createReplyPrefixOptions, createScopedPairingAccess, createTypingCallbacks, detectMime, dispatchReplyFromConfigWithSettledDispatcher, emptyPluginConfigSchema, evaluateSenderGroupAccessForPolicy, extensionForMime, extractOriginalFilename, fetchWithSsrFGuard, formatAllowlistMatchMeta, formatDocsLink, getFileExtension, hasConfiguredSecretInput, isDangerousNameMatchingEnabled, isHttpsUrlAllowedByHostnameSuffixAllowlist, isPrivateIpAddress, isSilentReplyText, keepHttpServerTaskAlive, loadOutboundMediaFromUrl, loadWebMedia, logInboundDrop, logTypingFailure, mergeAllowFromEntries, mergeAllowlist, normalizeChannelSlug, normalizeHostnameSuffixAllowlist, normalizeResolvedSecretInputString, normalizeSecretInputString, normalizeStringEntries, promptChannelAccessConfig, readJsonFileWithFallback, readStoreAllowFromForDmPolicy, recordPendingHistoryEntryIfEnabled, resolveAllowlistMatchSimple, resolveAllowlistProviderRuntimeGroupPolicy, resolveChannelEntryMatchWithFallback, resolveChannelMediaMaxBytes, resolveControlCommandGate, resolveDefaultGroupPolicy, resolveDmGroupAccessWithLists, resolveEffectiveAllowFromLists, resolveInboundSessionEnvelopeContext, resolveMentionGating, resolveNestedAllowlistDecision, resolveSenderScopedGroupPolicy, resolveToolsBySender, setTopLevelChannelAllowFrom, setTopLevelChannelDmPolicyWithAllowFrom, setTopLevelChannelGroupPolicy, sleep, splitOnboardingEntries, summarizeMapping, withFileLock, writeJsonFileAtomically };
