import "./run-with-concurrency-DKyjYPBF.js";
import "./plugins-BB8tJCZU.js";
import "./accounts-B2dcuvfm.js";
import "./model-auth-BQbQxm_U.js";
import { B as shouldLogVerbose, R as logVerbose } from "./logger-D-NoZ0-e.js";
import "./paths-CyBu6eBm.js";
import "./github-copilot-token-CYOZhiYW.js";
import "./thinking-B4hron7F.js";
import "./image-ops-CyRyYsp0.js";
import "./pi-embedded-helpers-D7aWG1a2.js";
import "./accounts-D9qgbnMC.js";
import "./paths-D_47imm-.js";
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, p as isAudioAttachment, t as runAudioTranscription } from "./audio-transcription-runner-D4qZovC_.js";
import "./image-C5phNNN6.js";
import "./chrome-BysAWpFk.js";
import "./skills-lRCwXWwo.js";
import "./path-alias-guards-PaZW0WNH.js";
import "./proxy-env-Ci-s5A4a.js";
import "./redact-DHod2Fyz.js";
import "./errors-BOv7VVr6.js";
import "./fs-safe-Ca2pX9wc.js";
import "./store-CO7bvTgh.js";
import "./tool-images-5h52xKC6.js";
import "./fetch-guard-CatMHzad.js";
import "./api-key-rotation-BDgsszn0.js";
import "./local-roots-Dj0s_gDM.js";
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
