import { useTheme, type ThemeChoice } from "../lib/theme.js";

function IcoSun() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IcoMoon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function IcoSystem() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

const OPTIONS: { key: ThemeChoice; label: string; Icon: () => JSX.Element }[] = [
  { key: "light", label: "Light", Icon: IcoSun },
  { key: "dark", label: "Dark", Icon: IcoMoon },
  { key: "system", label: "Follow the system", Icon: IcoSystem },
];

/** Three-way theme switch: light, dark, or whatever the device asks for. */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        borderRadius: 10,
        border: "1px solid var(--hairline-2)",
        background: "var(--surface-2)",
        flex: "none",
      }}
    >
      {OPTIONS.map(({ key, label, Icon }) => {
        const on = choice === key;
        return (
          <button
            key={key}
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => setChoice(key)}
            style={{
              width: 28,
              height: 26,
              display: "grid",
              placeItems: "center",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: on ? "var(--accent)" : "transparent",
              color: on ? "#fff" : "var(--text-dim)",
            }}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
