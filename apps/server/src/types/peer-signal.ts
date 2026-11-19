/** WebRTC wire values shared with Node without importing browser resources. */
export type PeerSignal =
  | {
      readonly signalType: 'offer' | 'answer';
      readonly data: {
        readonly type: 'offer' | 'answer' | 'pranswer' | 'rollback';
        readonly sdp?: string;
      };
    }
  | {
      readonly signalType: 'ice';
      readonly data: {
        readonly candidate?: string;
        readonly sdpMid?: string | null;
        readonly sdpMLineIndex?: number | null;
        readonly usernameFragment?: string | null;
      };
    }
  | { readonly signalType: 'stream-watch'; readonly data: { readonly watching: boolean } }
  | { readonly signalType: 'renegotiate-request'; readonly data: { readonly iceRestart: boolean } };
