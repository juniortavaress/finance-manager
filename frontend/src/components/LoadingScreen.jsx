export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="load-mark">
        <svg viewBox="0 0 84 84" xmlns="http://www.w3.org/2000/svg">
          <circle className="load-ring" cx="42" cy="42" r="35" />
          <circle className="load-ring-progress" cx="42" cy="42" r="35" />
          <g className="load-needle">
            <line x1="42" y1="42" x2="42" y2="20" stroke="#EEF2F0" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <circle className="load-dot" cx="42" cy="42" r="4.5" />
        </svg>
      </div>
      <div className="load-word">Atmos</div>
      <div className="load-tagline">organizando suas finanças</div>
      <div className="load-bar-track">
        <div className="load-bar-fill" />
      </div>
    </div>
  );
}
