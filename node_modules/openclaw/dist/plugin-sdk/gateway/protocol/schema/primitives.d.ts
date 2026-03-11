export declare const NonEmptyString: import("@sinclair/typebox").TString;
export declare const CHAT_SEND_SESSION_KEY_MAX_LENGTH = 512;
export declare const ChatSendSessionKeyString: import("@sinclair/typebox").TString;
export declare const SessionLabelString: import("@sinclair/typebox").TString;
export declare const GatewayClientIdSchema: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"cli" | "test" | "webchat" | "webchat-ui" | "openclaw-control-ui" | "gateway-client" | "openclaw-macos" | "openclaw-ios" | "openclaw-android" | "node-host" | "fingerprint" | "openclaw-probe">[]>;
export declare const GatewayClientModeSchema: import("@sinclair/typebox").TUnion<import("@sinclair/typebox").TLiteral<"node" | "cli" | "ui" | "test" | "webchat" | "backend" | "probe">[]>;
export declare const SecretRefSourceSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"env">, import("@sinclair/typebox").TLiteral<"file">, import("@sinclair/typebox").TLiteral<"exec">]>;
export declare const SecretRefSchema: import("@sinclair/typebox").TObject<{
    source: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"env">, import("@sinclair/typebox").TLiteral<"file">, import("@sinclair/typebox").TLiteral<"exec">]>;
    provider: import("@sinclair/typebox").TString;
    id: import("@sinclair/typebox").TString;
}>;
export declare const SecretInputSchema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TObject<{
    source: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"env">, import("@sinclair/typebox").TLiteral<"file">, import("@sinclair/typebox").TLiteral<"exec">]>;
    provider: import("@sinclair/typebox").TString;
    id: import("@sinclair/typebox").TString;
}>]>;
