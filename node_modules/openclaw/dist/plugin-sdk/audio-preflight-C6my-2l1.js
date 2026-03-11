import "./run-with-concurrency-2ga3-CMk.js";
import "./accounts-BFBjizxh.js";
import "./paths-eFexkPEh.js";
import "./github-copilot-token-Cxf8QYZb.js";
import "./config-DiiPndBn.js";
import { B as shouldLogVerbose, R as logVerbose } from "./logger-U3s76KST.js";
import "./thinking-CfIPyoMg.js";
import "./image-ops-ZjRT9yvG.js";
import "./pi-embedded-helpers-Dmr3bcbH.js";
import "./plugins-Bhm3N6Y-.js";
import "./accounts-Cx0R0Kpq.js";
import "./paths-yc45qYMp.js";
import "./redact-z6WVaymT.js";
import "./errors-DR1SiaHP.js";
import "./path-alias-guards-DFv45kR8.js";
import "./fs-safe-BbZgytb6.js";
import "./ssrf-D6FSPiLK.js";
import "./fetch-guard-BMQY_BjF.js";
import "./local-roots-Zhwi3hFj.js";
import "./tool-images-DGP_dM0r.js";
import { i as normalizeMediaAttachments, m as isAudioAttachment, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription } from "./audio-transcription-runner-C72KQQVh.js";
import "./image-DqJ0oIQs.js";
import "./chrome-Ct-HBrex.js";
import "./skills-BC9BA6b0.js";
import "./store-BfiJnRiX.js";
import "./api-key-rotation-DoiAvDNZ.js";
import "./proxy-fetch-0VcTBuoM.js";
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
