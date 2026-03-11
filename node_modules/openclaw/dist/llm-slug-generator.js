import { a as resolveAgentDir, l as resolveAgentWorkspaceDir, o as resolveAgentEffectiveModelPrimary, u as resolveDefaultAgentId } from "./run-with-concurrency-CLqOp5Ex.js";
import "./paths-DkxwiA8g.js";
import { t as createSubsystemLogger } from "./subsystem-C9Gk4AAH.js";
import "./workspace-Cn3fdLBW.js";
import "./logger-CJbXRTpA.js";
import { Ar as DEFAULT_PROVIDER, l as parseModelRef } from "./model-selection-C8ExQCsd.js";
import "./github-copilot-token-8N63GdbE.js";
import "./legacy-names-dyOVyQ4G.js";
import "./thinking-iS7Vx60r.js";
import "./tokens-C27XM9Ox.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-jHMb7qEG.js";
import "./plugins-GLBgHzdU.js";
import "./accounts-BuKlX4yK.js";
import "./send-BTUAUdKP.js";
import "./send-DK-wiMHd.js";
import "./deliver-VcwpsUP2.js";
import "./diagnostic-CBRo5_kJ.js";
import "./accounts-D0dZGdL5.js";
import "./image-ops-BnQjE9aK.js";
import "./send-BaR0FA16.js";
import "./pi-model-discovery-RxA0bewA.js";
import "./pi-embedded-helpers-0rK8Y0KQ.js";
import "./chrome-CsliCm3w.js";
import "./frontmatter-DR8lvaM9.js";
import "./skills-B2xU2F7d.js";
import "./path-alias-guards-Btg2RyAC.js";
import "./proxy-env-C2KrBwJo.js";
import "./redact-BHkqR4gQ.js";
import "./errors-CH6uzT9l.js";
import "./fs-safe-C6qEGKLE.js";
import "./store-Ckne-lqQ.js";
import "./paths-u6SI4r8Z.js";
import "./tool-images-Ox4B6iGw.js";
import "./image-C9KB_ouZ.js";
import "./audio-transcription-runner-vHAD2yj9.js";
import "./fetch-B4gJ77w9.js";
import "./fetch-guard-DclAx9Ee.js";
import "./api-key-rotation-cSqbom_f.js";
import "./proxy-fetch-53_Tkfsi.js";
import "./ir-BXNEFjR6.js";
import "./render-7C7EDC8_.js";
import "./target-errors-CceFalZl.js";
import "./commands-registry-BSNGqNrt.js";
import "./skill-commands-b6uBh7bc.js";
import "./fetch-CONQGbzL.js";
import "./channel-activity-8E8d5aiU.js";
import "./tables-5tS68D4O.js";
import "./send-DtCCZ9Az.js";
import "./outbound-attachment-BExxZbtI.js";
import "./send-BSGWgqco.js";
import "./proxy-o7sro0Y0.js";
import "./manager-Ch8Hmvy3.js";
import "./query-expansion-UVjZgC6t.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
//#region src/hooks/llm-slug-generator.ts
/**
* LLM-based slug generator for session memory filenames
*/
const log = createSubsystemLogger("llm-slug-generator");
/**
* Generate a short 1-2 word filename slug from session content using LLM
*/
async function generateSlugViaLLM(params) {
	let tempSessionFile = null;
	try {
		const agentId = resolveDefaultAgentId(params.cfg);
		const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
		const agentDir = resolveAgentDir(params.cfg, agentId);
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-slug-"));
		tempSessionFile = path.join(tempDir, "session.jsonl");
		const prompt = `Based on this conversation, generate a short 1-2 word filename slug (lowercase, hyphen-separated, no file extension).

Conversation summary:
${params.sessionContent.slice(0, 2e3)}

Reply with ONLY the slug, nothing else. Examples: "vendor-pitch", "api-design", "bug-fix"`;
		const modelRef = resolveAgentEffectiveModelPrimary(params.cfg, agentId);
		const parsed = modelRef ? parseModelRef(modelRef, DEFAULT_PROVIDER) : null;
		const provider = parsed?.provider ?? "anthropic";
		const model = parsed?.model ?? "claude-opus-4-6";
		const result = await runEmbeddedPiAgent({
			sessionId: `slug-generator-${Date.now()}`,
			sessionKey: "temp:slug-generator",
			agentId,
			sessionFile: tempSessionFile,
			workspaceDir,
			agentDir,
			config: params.cfg,
			prompt,
			provider,
			model,
			timeoutMs: 15e3,
			runId: `slug-gen-${Date.now()}`
		});
		if (result.payloads && result.payloads.length > 0) {
			const text = result.payloads[0]?.text;
			if (text) return text.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || null;
		}
		return null;
	} catch (err) {
		const message = err instanceof Error ? err.stack ?? err.message : String(err);
		log.error(`Failed to generate slug: ${message}`);
		return null;
	} finally {
		if (tempSessionFile) try {
			await fs.rm(path.dirname(tempSessionFile), {
				recursive: true,
				force: true
			});
		} catch {}
	}
}
//#endregion
export { generateSlugViaLLM };
