import { w as shouldLogVerbose, x as logVerbose } from "./subsystem-kzdGVyce.js";
import "./paths-BfR2LXbA.js";
import "./boolean-BHdNsbzF.js";
import "./auth-profiles-UpqQjKB-.js";
import "./agent-scope-BDXYqF89.js";
import "./utils-B4wShrgI.js";
import "./boundary-file-read-CcBHg_z-.js";
import "./logger-BWbD2ty6.js";
import "./exec-CDUUaRm4.js";
import "./github-copilot-token-CcBrBN3h.js";
import "./host-env-security-blJbxyQo.js";
import "./version-Bxx5bg6l.js";
import "./registry-Gs6xb3DK.js";
import "./manifest-registry-CFnC0yb4.js";
import "./dock-6TSCZqEs.js";
import "./models-config-Ct5bZG7t.js";
import "./plugins-v0UiRqAc.js";
import "./accounts-CFByy36g.js";
import "./channel-config-helpers-Cc37-fbu.js";
import "./accounts-Dd357WkV.js";
import "./image-ops-BZX4S9OA.js";
import "./message-channel-FOsBizRL.js";
import "./pi-embedded-helpers-nnm4iOi3.js";
import "./sandbox-D5S9pIUQ.js";
import "./tool-catalog-DAnzECvM.js";
import "./chrome-_dzns-pF.js";
import "./tailscale-DwUR_aBY.js";
import "./tailnet-BEiNr4qb.js";
import "./ws-BzHIlqUk.js";
import "./auth-ztX1XT7i.js";
import "./credentials-UUOBfSK0.js";
import "./resolve-configured-secret-input-string-CALUVGLW.js";
import "./server-context-Cysq8uwv.js";
import "./frontmatter-B5Xx_5Cp.js";
import "./env-overrides-CghEbWu_.js";
import "./path-alias-guards-2B2VwR9Z.js";
import "./skills-BcTP9HTD.js";
import "./paths-Bv0Fd5hm.js";
import "./proxy-env-DBXIh4R2.js";
import "./redact-b9XS0Muh.js";
import "./errors-oTqWODa8.js";
import "./fs-safe-DnLkCsXk.js";
import "./store-Cpd6HHUc.js";
import "./ports-DwmubRiU.js";
import "./trash-CKkKoeyk.js";
import "./server-middleware-D5JzODMR.js";
import "./sessions-Bh025Q5O.js";
import "./paths-D3cXuvcv.js";
import "./chat-envelope-Ba8wEdTK.js";
import "./tool-images-CpDLyo5v.js";
import "./thinking-CHrWXrB4.js";
import "./model-catalog-RhG2KE3w.js";
import "./fetch-CEXnYKAv.js";
import { i as normalizeMediaAttachments, o as resolveMediaAttachmentLocalRoots, t as runAudioTranscription, y as isAudioAttachment } from "./audio-transcription-runner-CkHnvIGC.js";
import "./fetch-guard-W2TcXMQH.js";
import "./image-CiVJHtoW.js";
import "./tool-display-BJIcX_xB.js";
import "./api-key-rotation-BQqyYKRt.js";
import "./proxy-fetch-BJuVlAGN.js";
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
