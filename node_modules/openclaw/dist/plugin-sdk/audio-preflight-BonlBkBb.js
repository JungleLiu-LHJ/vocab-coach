import "./run-with-concurrency-tODp1hy3.js";
import "./plugins-e62olPre.js";
import "./model-auth-BQ4Cp3j8.js";
import { B as shouldLogVerbose, R as logVerbose } from "./logger-D-NoZ0-e.js";
import "./paths-CyBu6eBm.js";
import "./github-copilot-token-CYOZhiYW.js";
import "./thinking-D-7Pwj4y.js";
import "./accounts-Dp-gY4hm.js";
import "./ssrf-BOgvekn1.js";
import "./fetch-guard-DqcetWYz.js";
import "./image-ops-BrTKipfG.js";
import "./pi-embedded-helpers-C7GCMUPD.js";
import "./accounts-DLGN1oUP.js";
import "./paths-Cn4jOpOv.js";
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, p as isAudioAttachment, t as runAudioTranscription } from "./audio-transcription-runner-DsiU1gkv.js";
import "./image-Cj2Jg3ch.js";
import "./chrome-D5Lr0QX7.js";
import "./skills-B_DPlC7t.js";
import "./path-alias-guards-8uK4lP7_.js";
import "./redact-B1C1rXrR.js";
import "./errors-CReGQ7X8.js";
import "./fs-safe-CfCxUVsz.js";
import "./store-C5u6XrXo.js";
import "./tool-images-B2l1KmaR.js";
import "./api-key-rotation-CnwWrazx.js";
import "./local-roots-DR4GvGT2.js";
import "./proxy-fetch-DWi0z2To.js";
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
