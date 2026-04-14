const DOT_DELAYS = ["0ms", "180ms", "360ms"] as const;

export const PulseDots = (props: { class?: string }) => (
  <span class={`ui-pulse-dots ${props.class ?? ""}`} aria-hidden="true">
    {DOT_DELAYS.map((delay) => (
      <span class="ui-pulse-dot" style={{ "animation-delay": delay }} />
    ))}
  </span>
);
