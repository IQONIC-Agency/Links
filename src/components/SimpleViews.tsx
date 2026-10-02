/** Shown to link-preview crawlers and bots: no links, nothing to flag. */
export function NeutralView() {
  return (
    <main className="lh-simple">
      <p>👋</p>
    </main>
  );
}

export function BlockedView() {
  return (
    <main className="lh-simple">
      <p>This page is not available in your region.</p>
    </main>
  );
}
