/**
 * Table footer: the "31–60 of 125" range on the left; rows-per-page and
 * Previous/Next on the right. A spinner shows while the next page loads.
 */
import { Loader } from "./Loader.js";

export const PAGE_SIZES = [10, 30, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 30;

export function TableFooter({
  offset,
  limit,
  total,
  onPage,
  onLimit,
  busy = false,
  noun = "",
}: {
  offset: number;
  limit: number;
  total: number;
  onPage: (offset: number) => void;
  onLimit?: (limit: number) => void;
  busy?: boolean;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderTop: "1px solid var(--hairline)", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
        {from}–{to} of {total.toLocaleString("en-US")}
        {noun ? ` ${noun}` : ""}
      </span>
      {busy && <Loader size={16} />}
      <div style={{ flex: 1 }} />
      {onLimit && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)" }}>
          Rows per page
          <select
            aria-label="Rows per page"
            value={limit}
            onChange={(e) => onLimit(Number(e.target.value))}
            style={{ background: "var(--bg-panel)", color: "var(--text)", border: "1px solid var(--hairline-2)", borderRadius: 8, padding: "5px 8px", fontSize: 12.5, cursor: "pointer" }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PageButton disabled={page <= 1 || busy} onClick={() => onPage(Math.max(0, offset - limit))}>
          Previous
        </PageButton>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)", minWidth: 64, textAlign: "center" }}>
          {page} / {pages}
        </span>
        <PageButton disabled={page >= pages || busy} onClick={() => onPage(offset + limit)}>
          Next
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({ children, disabled, onClick }: { children: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--track)",
        border: "1px solid var(--hairline-2)",
        borderRadius: 9,
        padding: "6px 12px",
        fontSize: 12.5,
        fontWeight: 600,
        color: disabled ? "var(--text-faint)" : "var(--text)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Client-side paging over an array already in memory. */
export function pageSlice<T>(items: T[], offset: number, limit: number): T[] {
  return items.slice(offset, offset + limit);
}
