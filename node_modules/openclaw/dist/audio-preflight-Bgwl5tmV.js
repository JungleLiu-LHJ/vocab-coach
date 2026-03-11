import "./run-with-concurrency-CLqOp5Ex.js";
import "./paths-DkxwiA8g.js";
import { d as logVerbose, m as shouldLogVerbose } from "./subsystem-C9Gk4AAH.js";
import "./workspace-Cn3fdLBW.js";
import "./logger-CJbXRTpA.js";
import "./model-selection-C8ExQCsd.js";
import "./github-copilot-token-8N63GdbE.js";
import "./legacy-names-dyOVyQ4G.js";
import "./thinking-iS7Vx60r.js";
import "./plugins-GLBgHzdU.js";
import "./accounts-BuKlX4yK.js";
import "./accounts-D0dZGdL5.js";
import "./image-ops-BnQjE9aK.js";
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
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription, v as isAudioAttachment } from "./audio-transcription-runner-vHAD2yj9.js";
import "./fetch-B4gJ77w9.js";
import "./fetch-guard-DclAx9Ee.js";
import "./api-key-rotation-cSqbom_f.js";
import "./proxy-fetch-53_Tkfsi.js";
//#region src/media-understanding/audio-preflight.ts
/**
* Transcribes the first audio attachment BEFORE mention checking.
* This allows voice notes to be processed in group chats with requireMention: true.
* Returns the transcript or undefined if transcription fails or no audio is found.
*/
async function transcribeFirstAudio(params) {
	const { ctx, cfg } = params;
	const audioConfig = cfg.tools?.media?.audio;
	if (!audioConfig || audioConfig.enabled === false) return;
	const attachments = normalizeMediaAttachments(ctx);
	if (!attachments || attachments.length === 0) return;
	const firstAudio = attachments.find((att) => att && isAudioAttachment(att) && !att.alreadyTranscribed);
	if (!firstAudio) return;
	if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribing attachment ${firstAudio.index} for mention check`);
	try {
		const { transcript } = await runAudioTranscription({
			ctx,
			cfg,
			attachments,
			agentDir: params.agentDir,
			providers: params.providers,
			activeModel: params.activeModel,
			localPathRoots: resolveMediaAttachmentLocalRoots({
				cfg,
				ctx
			})
		});
		if (!transcript) return;
		firstAudio.alreadyTranscribed = true;
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcribed ${transcript.length} chars from attachment ${firstAudio.index}`);
		return transcript;
	} catch (err) {
		if (shouldLogVerbose()) logVerbose(`audio-preflight: transcription failed: ${String(err)}`);
		return;
	}
}
//#endregion
export { transcribeFirstAudio };
