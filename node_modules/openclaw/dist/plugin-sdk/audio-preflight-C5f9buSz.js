import "./message-channel-BfBFtOb7.js";
import { B as shouldLogVerbose, R as logVerbose } from "./utils-B0IyLNx9.js";
import "./paths-Dmn791zP.js";
import "./tool-images-BzgB37_t.js";
import "./run-with-concurrency-C-4lcmuz.js";
import "./plugins-QUFoiGWF.js";
import "./accounts-DxLPfH09.js";
import "./model-auth-D4ii__OS.js";
import "./github-copilot-token-B_Z-mAek.js";
import "./thinking-CChP2naf.js";
import "./ssrf-Bs2JKULn.js";
import "./fetch-guard-DEbABfDW.js";
import "./pi-embedded-helpers-9u309C_h.js";
import "./accounts-BIw7mqTc.js";
import "./paths-BDzhyD2C.js";
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, p as isAudioAttachment, t as runAudioTranscription } from "./audio-transcription-runner-BiuTgYA9.js";
import "./image-CBzz5qrG.js";
import "./chrome-ZCHqE_BV.js";
import "./skills-DKmC-Nbk.js";
import "./path-alias-guards-CU27GHwO.js";
import "./redact-CzWQJedj.js";
import "./errors-BB_karnD.js";
import "./fs-safe-oJEid_SS.js";
import "./store-BJ9f1Rx9.js";
import "./api-key-rotation-C3qC4Vhi.js";
import "./local-roots-K3pRu4OE.js";
import "./proxy-fetch-BKb1uyZt.js";
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
