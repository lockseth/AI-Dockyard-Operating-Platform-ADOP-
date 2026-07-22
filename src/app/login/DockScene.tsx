// Decorative dock/ship illustration above the login form. Pure CSS
// keyframes (see globals.css .login-dock-*) — no client JS, no state, no
// layout shift (fixed-height container). aria-hidden since it carries no
// information; prefers-reduced-motion swaps to a static centered frame via
// CSS alone, so this component doesn't need to branch on it.
export function DockScene() {
  return (
    <div className="login-dock-scene" aria-hidden="true">
      <div className="login-dock-wave-far" />
      <div className="login-dock-wave-near" />
      <div className="login-dock-line" />
      <div className="login-dock-barge-track">
        <svg
          width="118"
          height="46"
          viewBox="0 0 118 46"
          fill="none"
          className="login-dock-barge-bob"
        >
          <rect x="10" y="18" width="90" height="16" rx="2" fill="#1c2a30" />
          <rect x="20" y="8" width="24" height="12" rx="1.5" fill="#2a3d45" />
          <rect x="24" y="3" width="6" height="7" fill="#7dd3e0" />
          <rect x="60" y="12" width="30" height="8" rx="1.5" fill="#2a3d45" />
          <path d="M100 22h10l-4 12h-10Z" fill="#1c2a30" />
          <path d="M8 22H0l4 12h6Z" fill="#1c2a30" />
        </svg>
      </div>
    </div>
  );
}
