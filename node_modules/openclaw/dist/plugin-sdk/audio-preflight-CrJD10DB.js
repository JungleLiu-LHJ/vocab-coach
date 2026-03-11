import "./run-with-concurrency-CvBOjUE3.js";
import "./config-upduwSBz.js";
import { B as shouldLogVerbose, R as logVerbose } from "./logger-CyvuRp4f.js";
import "./paths-D6tDENa_.js";
import "./accounts-CKWobc8T.js";
import "./plugins-f1v1_i9D.js";
import "./thinking-B4aBdZa6.js";
import "./image-ops-CSd6ioRA.js";
import "./pi-embedded-helpers-C-tB5b5B.js";
import "./accounts-CYGUsYvM.js";
import "./github-copilot-token-xlpfBCoP.js";
import "./paths-0c91o_Js.js";
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, p as isAudioAttachment, t as runAudioTranscription } from "./audio-transcription-runner-BtnWjA5B.js";
import "./image-BBszd7R_.js";
import "./chrome-CN1wAraE.js";
import "./skills-DrcY1qHs.js";
import "./path-alias-guards-RSyiESJ8.js";
import "./proxy-env-BR0_ihdh.js";
import "./redact-66Hhagy9.js";
import "./errors-C6T03XVS.js";
import "./fs-safe-K-umaOqX.js";
import "./store-XqCQC_cj.js";
import "./tool-images-BswvL9EH.js";
import "./fetch-guard-28z9IJbo.js";
import "./api-key-rotation-CQzQxcZg.js";
import "./local-roots-BxJbYi6l.js";
import "./proxy-fetch-BPy37MWG.js";
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
