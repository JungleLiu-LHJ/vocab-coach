import { a as saveMediaBuffer } from "./store-CF7lpR6V.js";
import { a as loadWebMedia } from "./ir-D1mVtfmQ.js";
import { t as buildOutboundMediaLoadOptions } from "./load-options-BRWTFhO4.js";
//#region src/media/outbound-attachment.ts
async function resolveOutboundAttachmentFromUrl(mediaUrl, maxBytes, options) {
	const media = await loadWebMedia(mediaUrl, buildOutboundMediaLoadOptions({
		maxBytes,
		mediaLocalRoots: options?.localRoots
	}));
	const saved = await saveMediaBuffer(media.buffer, media.contentType ?? void 0, "outbound", maxBytes);
	return {
		path: saved.path,
		contentType: saved.contentType
	};
}
//#endregion
export { resolveOutboundAttachmentFromUrl as t };
