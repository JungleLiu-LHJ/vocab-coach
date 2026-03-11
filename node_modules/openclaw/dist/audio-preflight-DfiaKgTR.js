import "./run-with-concurrency-CF8VuJbn.js";
import "./paths-DinMprTu.js";
import { B as shouldLogVerbose, R as logVerbose } from "./logger-BMLgyw16.js";
import "./model-selection-n7SaaZtn.js";
import "./github-copilot-token-BLpWpVXm.js";
import "./thinking-B8-468WR.js";
import "./plugins-DfC8FIFE.js";
import "./accounts-qz5jo9at.js";
import "./accounts-DZfZojfW.js";
import "./image-ops-cult1iKc.js";
import "./pi-embedded-helpers-BxOnIV6d.js";
import "./chrome-Dk7SpaMr.js";
import "./skills-DSroUgpf.js";
import "./path-alias-guards-MbRvgeun.js";
import "./proxy-env-DyR9mSSr.js";
import "./redact-DNJkL7j-.js";
import "./errors-BSnJC4eK.js";
import "./fs-safe-qlAETUEc.js";
import "./store-_BT3dZ3O.js";
import "./paths-DcVRZkOJ.js";
import "./tool-images-BsAYbBkW.js";
import "./image-CQZHKY7y.js";
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription, v as isAudioAttachment } from "./audio-transcription-runner-DjUHzw0r.js";
import "./fetch-9JIXDB87.js";
import "./fetch-guard-Ct1OEnNA.js";
import "./api-key-rotation-Bnv6asx5.js";
import "./proxy-fetch-DmIpD5u2.js";
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
