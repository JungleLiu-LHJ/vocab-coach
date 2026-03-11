import { l as resolveAgentWorkspaceDir, r as listAgentIds } from "../../run-with-concurrency-CLqOp5Ex.js";
import "../../paths-DkxwiA8g.js";
import { a as defaultRuntime, t as createSubsystemLogger } from "../../subsystem-C9Gk4AAH.js";
import { B as resolveAgentIdFromSessionKey } from "../../workspace-Cn3fdLBW.js";
import "../../logger-CJbXRTpA.js";
import "../../model-selection-C8ExQCsd.js";
import "../../github-copilot-token-8N63GdbE.js";
import { a as isGatewayStartupEvent } from "../../legacy-names-dyOVyQ4G.js";
import "../../thinking-iS7Vx60r.js";
import { n as SILENT_REPLY_TOKEN } from "../../tokens-C27XM9Ox.js";
import { o as agentCommand, s as createDefaultDeps } from "../../pi-embedded-jHMb7qEG.js";
import "../../plugins-GLBgHzdU.js";
import "../../accounts-BuKlX4yK.js";
import "../../send-BTUAUdKP.js";
import "../../send-DK-wiMHd.js";
import "../../deliver-VcwpsUP2.js";
import "../../diagnostic-CBRo5_kJ.js";
import "../../accounts-D0dZGdL5.js";
import "../../image-ops-BnQjE9aK.js";
import "../../send-BaR0FA16.js";
import "../../pi-model-discovery-RxA0bewA.js";
import { Dt as resolveAgentMainSessionKey, W as loadSessionStore, Y as updateSessionStore, kt as resolveMainSessionKey } from "../../pi-embedded-helpers-0rK8Y0KQ.js";
import "../../chrome-CsliCm3w.js";
import "../../frontmatter-DR8lvaM9.js";
import "../../skills-B2xU2F7d.js";
import "../../path-alias-guards-Btg2RyAC.js";
import "../../proxy-env-C2KrBwJo.js";
import "../../redact-BHkqR4gQ.js";
import "../../errors-CH6uzT9l.js";
import "../../fs-safe-C6qEGKLE.js";
import "../../store-Ckne-lqQ.js";
import { s as resolveStorePath } from "../../paths-u6SI4r8Z.js";
import "../../tool-images-Ox4B6iGw.js";
import "../../image-C9KB_ouZ.js";
import "../../audio-transcription-runner-vHAD2yj9.js";
import "../../fetch-B4gJ77w9.js";
import "../../fetch-guard-DclAx9Ee.js";
import "../../api-key-rotation-cSqbom_f.js";
import "../../proxy-fetch-53_Tkfsi.js";
import "../../ir-BXNEFjR6.js";
import "../../render-7C7EDC8_.js";
import "../../target-errors-CceFalZl.js";
import "../../commands-registry-BSNGqNrt.js";
import "../../skill-commands-b6uBh7bc.js";
import "../../fetch-CONQGbzL.js";
import "../../channel-activity-8E8d5aiU.js";
import "../../tables-5tS68D4O.js";
import "../../send-DtCCZ9Az.js";
import "../../outbound-attachment-BExxZbtI.js";
import "../../send-BSGWgqco.js";
import "../../proxy-o7sro0Y0.js";
import "../../manager-Ch8Hmvy3.js";
import "../../query-expansion-UVjZgC6t.js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
//#region src/gateway/boot.ts
function generateBootSessionId() {
	return `boot-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "")}-${crypto.randomUUID().slice(0, 8)}`;
}
const log$1 = createSubsystemLogger("gateway/boot");
const BOOT_FILENAME = "BOOT.md";
function buildBootPrompt(content) {
	return [
		"You are running a boot check. Follow BOOT.md instructions exactly.",
		"",
		"BOOT.md:",
		content,
		"",
		"If BOOT.md asks you to send a message, use the message tool (action=send with channel + target).",
		"Use the `target` field (not `to`) for message tool destinations.",
		`After sending with the message tool, reply with ONLY: ${SILENT_REPLY_TOKEN}.`,
		`If nothing needs attention, reply with ONLY: ${SILENT_REPLY_TOKEN}.`
	].join("\n");
}
async function loadBootFile(workspaceDir) {
	const bootPath = path.join(workspaceDir, BOOT_FILENAME);
	try {
		const trimmed = (await fs.readFile(bootPath, "utf-8")).trim();
		if (!trimmed) return { status: "empty" };
		return {
			status: "ok",
			content: trimmed
		};
	} catch (err) {
		if (err.code === "ENOENT") return { status: "missing" };
		throw err;
	}
}
function snapshotMainSessionMapping(params) {
	const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
	const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
	try {
		const entry = loadSessionStore(storePath, { skipCache: true })[params.sessionKey];
		if (!entry) return {
			storePath,
			sessionKey: params.sessionKey,
			canRestore: true,
			hadEntry: false
		};
		return {
			storePath,
			sessionKey: params.sessionKey,
			canRestore: true,
			hadEntry: true,
			entry: structuredClone(entry)
		};
	} catch (err) {
		log$1.debug("boot: could not snapshot main session mapping", {
			sessionKey: params.sessionKey,
			error: String(err)
		});
		return {
			storePath,
			sessionKey: params.sessionKey,
			canRestore: false,
			hadEntry: false
		};
	}
}
async function restoreMainSessionMapping(snapshot) {
	if (!snapshot.canRestore) return;
	try {
		await updateSessionStore(snapshot.storePath, (store) => {
			if (snapshot.hadEntry && snapshot.entry) {
				store[snapshot.sessionKey] = snapshot.entry;
				return;
			}
			delete store[snapshot.sessionKey];
		}, { activeSessionKey: snapshot.sessionKey });
		return;
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
}
async function runBootOnce(params) {
	const bootRuntime = {
		log: () => {},
		error: (message) => log$1.error(String(message)),
		exit: defaultRuntime.exit
	};
	let result;
	try {
		result = await loadBootFile(params.workspaceDir);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log$1.error(`boot: failed to read ${BOOT_FILENAME}: ${message}`);
		return {
			status: "failed",
			reason: message
		};
	}
	if (result.status === "missing" || result.status === "empty") return {
		status: "skipped",
		reason: result.status
	};
	const sessionKey = params.agentId ? resolveAgentMainSessionKey({
		cfg: params.cfg,
		agentId: params.agentId
	}) : resolveMainSessionKey(params.cfg);
	const message = buildBootPrompt(result.content ?? "");
	const sessionId = generateBootSessionId();
	const mappingSnapshot = snapshotMainSessionMapping({
		cfg: params.cfg,
		sessionKey
	});
	let agentFailure;
	try {
		await agentCommand({
			message,
			sessionKey,
			sessionId,
			deliver: false,
			senderIsOwner: true
		}, bootRuntime, params.deps);
	} catch (err) {
		agentFailure = err instanceof Error ? err.message : String(err);
		log$1.error(`boot: agent run failed: ${agentFailure}`);
	}
	const mappingRestoreFailure = await restoreMainSessionMapping(mappingSnapshot);
	if (mappingRestoreFailure) log$1.error(`boot: failed to restore main session mapping: ${mappingRestoreFailure}`);
	if (!agentFailure && !mappingRestoreFailure) return { status: "ran" };
	return {
		status: "failed",
		reason: [agentFailure ? `agent run failed: ${agentFailure}` : void 0, mappingRestoreFailure ? `mapping restore failed: ${mappingRestoreFailure}` : void 0].filter((part) => Boolean(part)).join("; ")
	};
}
//#endregion
//#region src/hooks/bundled/boot-md/handler.ts
const log = createSubsystemLogger("hooks/boot-md");
const runBootChecklist = async (event) => {
	if (!isGatewayStartupEvent(event)) return;
	if (!event.context.cfg) return;
	const cfg = event.context.cfg;
	const deps = event.context.deps ?? createDefaultDeps();
	const agentIds = listAgentIds(cfg);
	for (const agentId of agentIds) {
		const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
		const result = await runBootOnce({
			cfg,
			deps,
			workspaceDir,
			agentId
		});
		if (result.status === "failed") {
			log.warn("boot-md failed for agent startup run", {
				agentId,
				workspaceDir,
				reason: result.reason
			});
			continue;
		}
		if (result.status === "skipped") log.debug("boot-md skipped for agent startup run", {
			agentId,
			workspaceDir,
			reason: result.reason
		});
	}
};
//#endregion
export { runBootChecklist as default };
