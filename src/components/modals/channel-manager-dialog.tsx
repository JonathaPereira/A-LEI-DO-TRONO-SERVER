/** Stable modal host; management-runtime owns the React contents. */
export function ChannelManagerDialog() {
  return (
    <dialog
      id="channelManagerDialog"
      className="feature-dialog"
      aria-labelledby="channelManagerTitle"
    />
  );
}
