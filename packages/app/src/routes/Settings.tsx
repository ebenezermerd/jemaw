import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGroup,
  useAddMember,
  useRenameMember,
  useSetMemberRole,
  useSetMemberPrimary,
  useUpdateGroup,
  useResetGroup,
  useTelegramCandidates,
  useAssignMemberTelegram,
  useMemberSummary,
  useRemoveMember,
  useMeSummary,
  useHumorSettings,
  useUpdateHumorSettings,
} from "../lib/hooks.js";
import type { AssignTelegramInput, MemberDto } from "@jemaw/shared/types";
import { formatMoney } from "../lib/money.js";
import { Button } from "../ui/primitives.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { PageHeader } from "../ui/PageHeader.js";
import { PageLoader } from "../motion/Loader.js";
import { Modal } from "../motion/Modal.js";
import { Centered } from "./Balances.js";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme.js";
import { useToast } from "../ui/Toast.js";

const CURRENCIES = ["EUR", "USD", "GBP", "ETB", "JPY", "CHF", "CAD", "AUD"];

export function Settings() {
  const group = useGroup();
  const addMember = useAddMember();
  const rename = useRenameMember();
  const setRole = useSetMemberRole();
  const setPrimary = useSetMemberPrimary();
  const updateGroup = useUpdateGroup();
  const resetGroup = useResetGroup();
  const nav = useNavigate();
  const [newName, setNewName] = useState("");
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [confirmReset, setConfirmReset] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const me = useMeSummary();
  const humorQ = useHumorSettings();
  const updateHumor = useUpdateHumorSettings();

  if (group.isLoading) return <PageLoader />;
  const g = group.data;
  if (!g) return <Centered>Couldn't load settings.</Centered>;
  const isAdmin = g.isAdmin;
  const humor = humorQ.data ?? g.humor;
  const activeMembers = g.members.filter((m) => m.isActive);
  const editMember = editMemberId
    ? g.members.find((m) => m.id === editMemberId) ?? null
    : null;

  async function doReset() {
    await resetGroup.mutateAsync();
    setConfirmReset(false);
    nav("/");
  }

  function pickTheme(p: ThemePref) {
    setTheme(p);
    setThemePref(p); // applies + persists immediately
  }

  return (
    <div>
      <PageHeader title="Settings" fallback="/" />
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 28, minWidth: 0 }}>
      {/* Appearance */}
      <Section title="Appearance">
        <Row label="Theme">
          <Segmented
            value={theme}
            onChange={pickTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
      </Section>

      {/* Interactive humor (Phase 1–2) */}
      <Section title="Jemaw voice">
        <p className="t-caption" style={{ color: "var(--text-faint)", margin: "0 0 8px" }}>
          Short lines in the group after scans. Money facts stay exact; humor never changes the ledger.
          Default is off.
        </p>
        <Row label="Mode">
          {isAdmin ? (
            <Segmented
              value={humor?.mode ?? "off"}
              onChange={async (mode) => {
                await updateHumor.mutateAsync({
                  mode: mode as "off" | "jemaw_dry" | "roast" | "chaos",
                });
                await humorQ.refetch();
                await group.refetch();
              }}
              options={[
                { value: "off", label: "Off" },
                { value: "jemaw_dry", label: "Dry" },
                { value: "roast", label: "Roast" },
                { value: "chaos", label: "Chaos" },
              ]}
            />
          ) : (
            <span className="t-body" style={{ color: "var(--text-muted)" }}>
              {humor?.mode ?? "off"}
            </span>
          )}
        </Row>
        {isAdmin && humor && humor.mode !== "off" && (
          <>
            <Row label="Model lines">
              <Segmented
                value={humor.useModelComposer ? "on" : "off"}
                onChange={async (v) => {
                  await updateHumor.mutateAsync({
                    useModelComposer: v === "on",
                  });
                  await humorQ.refetch();
                }}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Templates" },
                ]}
              />
            </Row>
            <Row label="Mute 7 days">
              <Button
                variant="ghost"
                disabled={updateHumor.isPending}
                onClick={async () => {
                  await updateHumor.mutateAsync({ muteDays: 7 });
                  await humorQ.refetch();
                }}
              >
                Mute
              </Button>
            </Row>
            {humor.mutedUntil && (
              <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
                Muted until {new Date(humor.mutedUntil).toLocaleString()}
              </p>
            )}
          </>
        )}
      </Section>

      {/* Group */}
      <Section title="Group">
        <Row label="Name">
          <span className="t-body-strong">{g.name}</span>
        </Row>
        <Row label="Currency">
          {g.hasExpenses || !isAdmin ? (
            <span className="t-body" style={{ color: "var(--text-muted)" }}>
              {g.defaultCurrency}
              {g.hasExpenses ? " · locked" : ""}
            </span>
          ) : (
            <CurrencyPicker
              value={g.defaultCurrency}
              busy={updateGroup.isPending}
              onChange={async (currency) => {
                await updateGroup.mutateAsync({ defaultCurrency: currency });
                await group.refetch();
              }}
            />
          )}
        </Row>
        {g.hasExpenses && (
          <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
            Currency can't change once expenses exist.
          </p>
        )}
      </Section>

      {/* Members */}
      <Section title="Members">
        <div style={{ display: "grid", gap: 4 }}>
          {activeMembers.map((m) => (
            <button
              key={m.id}
              onClick={() => isAdmin && setEditMemberId(m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 48,
                minWidth: 0,
                width: "100%",
                padding: "6px 4px",
                background: "transparent",
                border: "none",
                textAlign: "left",
                cursor: isAdmin ? "pointer" : "default",
                color: "var(--text)",
              }}
            >
              <MemberAvatar
                name={m.displayName}
                telegramUserId={m.telegramUserId}
                size={32}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.displayName}
                </div>
                <div className="t-caption" style={{ color: "var(--text-muted)" }}>
                  {m.role === "admin" ? "Admin" : "Member"}
                  {" · "}
                  {m.isPrimary ? "Primary" : "Secondary"}
                </div>
              </div>
              {m.role === "admin" && <Badge variant="accent">Admin</Badge>}
              {m.isPrimary && <Badge variant="positive">Primary</Badge>}
              {isAdmin && (
                <span style={{ color: "var(--text-faint)", flexShrink: 0, fontSize: 18 }}>›</span>
              )}
            </button>
          ))}
        </div>
        {isAdmin && (
          <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
            Tap a member to rename, set primary, change admin, or remove. Primary
            members are included in new splits by default.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add member by name"
            style={{ ...memberInput, height: 44, flex: 1 }}
          />
          <Button
            variant="ghost"
            disabled={!newName.trim() || addMember.isPending}
            onClick={async () => {
              await addMember.mutateAsync(newName.trim());
              setNewName("");
            }}
          >
            Add
          </Button>
        </div>
      </Section>

      {/* Danger zone — admins only */}
      {isAdmin && (
        <Section title="Danger zone">
          <Row label="Reset group data">
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              Reset
            </Button>
          </Row>
          <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
            Clears all expenses, settlements, and balances for this group. Members
            are kept. This can't be undone.
          </p>
        </Section>
      )}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)}>
        <h2 className="t-heading" style={{ marginTop: 0 }}>
          Reset group data?
        </h2>
        <p className="t-body" style={{ color: "var(--text-muted)" }}>
          Every expense, settlement, and balance in this group will be permanently
          removed. Members stay. This can't be undone.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button
            variant="ghost"
            onClick={() => setConfirmReset(false)}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={doReset}
            disabled={resetGroup.isPending}
            style={{ flex: 1 }}
          >
            {resetGroup.isPending ? "Resetting…" : "Reset"}
          </Button>
        </div>
      </Modal>

      {/* Per-member management (admins) */}
      <Modal open={!!editMember} onClose={() => setEditMemberId(null)}>
        {editMember && (
          <MemberEditor
            member={editMember}
            isLastAdmin={
              editMember.role === "admin" &&
              g.members.filter((x) => x.role === "admin").length <= 1
            }
            renaming={rename.isPending}
            togglingPrimary={setPrimary.isPending}
            togglingRole={setRole.isPending}
            onRename={async (name) => {
              await rename.mutateAsync({
                memberId: editMember.id,
                displayName: name,
              });
              await group.refetch();
            }}
            onTogglePrimary={async () => {
              await setPrimary.mutateAsync({
                memberId: editMember.id,
                isPrimary: !editMember.isPrimary,
              });
              await group.refetch();
            }}
            onToggleRole={async () => {
              await setRole.mutateAsync({
                memberId: editMember.id,
                role: editMember.role === "admin" ? "member" : "admin",
              });
              await group.refetch();
            }}
            canRemove={me.data ? me.data.memberId !== editMember.id : false}
            onRemove={() => {
              setEditMemberId(null);
              setRemoveMemberId(editMember.id);
            }}
            onClose={() => setEditMemberId(null)}
          />
        )}
      </Modal>

      {/* Removal review + confirm (admins) */}
      <Modal open={!!removeMemberId} onClose={() => setRemoveMemberId(null)}>
        {removeMemberId && (
          <RemoveMemberModal
            memberId={removeMemberId}
            currency={g.defaultCurrency}
            onClose={() => setRemoveMemberId(null)}
          />
        )}
      </Modal>
      </div>
    </div>
  );
}

/** Per-member management modal: rename, primary/secondary, admin role. */
function MemberEditor({
  member,
  isLastAdmin,
  renaming,
  togglingPrimary,
  togglingRole,
  onRename,
  onTogglePrimary,
  onToggleRole,
  canRemove,
  onRemove,
  onClose,
}: {
  member: MemberDto;
  isLastAdmin: boolean;
  renaming: boolean;
  togglingPrimary: boolean;
  togglingRole: boolean;
  onRename: (name: string) => Promise<unknown>;
  onTogglePrimary: () => Promise<unknown>;
  onToggleRole: () => Promise<unknown>;
  canRemove: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.displayName);
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const trimmed = name.trim();
  const hasRename = trimmed.length > 0 && trimmed !== member.displayName;
  const isSavingName = renaming || savingName;

  useEffect(() => {
    setName(member.displayName);
  }, [member.displayName]);

  async function saveName() {
    if (!hasRename) {
      onClose();
      return;
    }
    setError(null);
    setSavingName(true);
    try {
      await onRename(trimmed);
      setSavingName(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this name.");
      setSavingName(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <MemberAvatar name={member.displayName} telegramUserId={member.telegramUserId} size={44} />
        <h2 className="t-heading" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {member.displayName}
        </h2>
      </div>

      {/* rename */}
      <div style={{ display: "grid", gap: 6 }}>
        <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...memberInput, height: 44 }}
          disabled={isSavingName}
        />
        {error && (
          <span className="t-caption" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        )}
      </div>

      {/* primary toggle */}
      <ToggleRow
        label="Primary member"
        hint="Included in new expense splits by default."
        on={member.isPrimary}
        onClick={onTogglePrimary}
        busy={togglingPrimary}
        disabled={togglingPrimary}
      />

      {/* admin toggle */}
      <ToggleRow
        label="Group admin"
        hint={
          isLastAdmin
            ? "A group must keep at least one admin."
            : "Admins can edit, remove, and manage members."
        }
        on={member.role === "admin"}
        onClick={onToggleRole}
        busy={togglingRole}
        disabled={togglingRole || isLastAdmin}
      />

      {/* telegram account link */}
      <TelegramSection member={member} />

      {canRemove && (
        <Button variant="danger" onClick={onRemove} disabled={isSavingName}>
          Remove from group...
        </Button>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Button variant="ghost" onClick={onClose} disabled={isSavingName} style={{ flex: 1 }}>
          Close
        </Button>
        <Button
          onClick={saveName}
          disabled={isSavingName || trimmed.length === 0}
          style={{ flex: 1 }}
        >
          {isSavingName ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

const REMOVE_PAGE_SIZE = 4;

/**
 * Removal review modal: everything recorded about the member (KPIs, expenses,
 * settlements) on tabs with pagination, then an explicit confirm. Removal is
 * a hard delete when the member has no history, a deactivation otherwise.
 */
function RemoveMemberModal({
  memberId,
  currency,
  onClose,
}: {
  memberId: string;
  currency: string;
  onClose: () => void;
}) {
  const summary = useMemberSummary(memberId);
  const remove = useRemoveMember();
  const toast = useToast();
  const [tab, setTab] = useState<"expenses" | "settlements">("expenses");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const s = summary.data;

  async function doRemove() {
    setError(null);
    try {
      const result = await remove.mutateAsync(memberId);
      toast.show(
        result.removed === "deleted"
          ? "Member deleted."
          : "Member removed and kept in history.",
        "success",
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove this member.",
      );
    }
  }

  if (summary.isLoading || !s) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h2 className="t-heading" style={{ marginTop: 0 }}>
          Remove member?
        </h2>
        <p className="t-body" style={{ color: "var(--text-muted)" }}>
          {summary.isError
            ? "Couldn't load this member's data."
            : "Loading this member's data..."}
        </p>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const rows =
    tab === "expenses"
      ? s.expenses.map((e) => ({
          key: e.id,
          title: e.description,
          amount: formatMoney(e.role === "participant" ? e.share : e.amount, currency),
          caption: [
            e.role === "payer"
              ? "paid"
              : e.role === "both"
                ? `paid · own share ${formatMoney(e.share, currency)}`
                : "their share",
            e.occurredAt.slice(0, 10),
            e.settled ? "settled" : "open",
          ].join(" · "),
        }))
      : s.settlements.map((x) => ({
          key: x.id,
          title:
            x.direction === "sent"
              ? `Paid ${x.counterpartName}`
              : `Received from ${x.counterpartName}`,
          amount: formatMoney(x.amount, currency),
          caption: `${x.method} · ${x.when.slice(0, 10)}`,
        }));

  const pageCount = Math.max(1, Math.ceil(rows.length / REMOVE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(
    safePage * REMOVE_PAGE_SIZE,
    (safePage + 1) * REMOVE_PAGE_SIZE,
  );
  const busy = remove.isPending;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <MemberAvatar
          name={s.member.displayName}
          telegramUserId={s.member.telegramUserId}
          size={44}
        />
        <div style={{ minWidth: 0 }}>
          <h2 className="t-heading" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Remove {s.member.displayName}?
          </h2>
          <span className="t-caption" style={{ color: "var(--text-muted)" }}>
            Review their record before you decide.
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
        }}
      >
        <Kpi label="Paid" value={formatMoney(s.kpis.totalPaid, currency)} />
        <Kpi label="Their share" value={formatMoney(s.kpis.totalShare, currency)} />
        <Kpi
          label="Net"
          value={formatMoney(s.kpis.net, currency)}
          tone={
            Number(s.kpis.net) > 0
              ? "positive"
              : Number(s.kpis.net) < 0
                ? "negative"
                : undefined
          }
        />
        <Kpi label="Owes now" value={formatMoney(s.kpis.outstandingOwes, currency)} />
        <Kpi label="Owed now" value={formatMoney(s.kpis.outstandingOwed, currency)} />
        <Kpi
          label="Entries"
          value={`${s.kpis.expenseCount + s.kpis.settlementCount}`}
        />
      </div>

      {/* Tabs */}
      <Segmented
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(0);
        }}
        options={[
          { value: "expenses", label: `Expenses (${s.kpis.expenseCount})` },
          {
            value: "settlements",
            label: `Settlements (${s.kpis.settlementCount})`,
          },
        ]}
      />

      {/* Paginated list */}
      <div style={{ display: "grid", gap: 4, minHeight: 120 }}>
        {visible.length === 0 && (
          <span className="t-caption" style={{ color: "var(--text-muted)" }}>
            Nothing recorded here for this member.
          </span>
        )}
        {visible.map((r) => (
          <div
            key={r.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              padding: "6px 2px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="t-body-strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.title}
              </div>
              <div className="t-caption" style={{ color: "var(--text-faint)" }}>
                {r.caption}
              </div>
            </div>
            <span className="t-body-strong" style={{ flexShrink: 0 }}>
              {r.amount}
            </span>
          </div>
        ))}
      </div>
      {pageCount > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button
            variant="ghost"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            style={{ height: 34, padding: "0 14px" }}
          >
            Prev
          </Button>
          <span className="t-caption" style={{ color: "var(--text-muted)" }}>
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="ghost"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            style={{ height: 34, padding: "0 14px" }}
          >
            Next
          </Button>
        </div>
      )}

      {/* Confirm */}
      <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
        Are you sure you want to proceed? History stays intact: if{" "}
        {s.member.displayName} appears in past entries the account is kept but
        marked removed and locked out of the app; otherwise it is deleted
        permanently.
      </p>
      {error && (
        <span className="t-caption" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="ghost" onClick={onClose} disabled={busy} style={{ flex: 1 }}>
          Cancel
        </Button>
        <Button variant="danger" onClick={doRemove} disabled={busy} style={{ flex: 1 }}>
          {busy ? "Removing..." : "Remove member"}
        </Button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "8px 10px",
        display: "grid",
        gap: 2,
        minWidth: 0,
      }}
    >
      <span className="t-mono-label" style={{ color: "var(--text-muted)", fontSize: 9 }}>
        {label}
      </span>
      <span
        className="t-body-strong"
        style={{
          fontSize: 13,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color:
            tone === "positive"
              ? "var(--positive)"
              : tone === "negative"
                ? "var(--danger)"
                : "var(--text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Admin control for which Telegram account a member is. Assigning an account
 * already held by another member swaps the two identities; unlinking detaches
 * the account so the member goes back to a manual (unlinked) entry.
 */
function TelegramSection({ member }: { member: MemberDto }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const candidates = useTelegramCandidates(open);
  const assign = useAssignMemberTelegram();
  const toast = useToast();

  const linked = member.telegramLinked;
  const busy = assign.isPending;

  async function doAssign(input: AssignTelegramInput) {
    setError(null);
    try {
      await assign.mutateAsync({ memberId: member.id, input });
      toast.show(
        input.telegramUserId === null
          ? "Telegram account unlinked."
          : "Telegram account updated.",
        "success",
      );
      setOpen(false);
      setQuery("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update this account.",
      );
    }
  }

  // Search-and-select: filter known accounts by @username or name as you type.
  const q = query.trim().replace(/^@/, "").toLowerCase();
  const all = (candidates.data?.candidates ?? []).filter(
    (c) => c.memberId !== member.id,
  );
  const list = q
    ? all.filter(
        (c) =>
          (c.username ?? "").toLowerCase().includes(q) ||
          (c.displayName ?? "").toLowerCase().includes(q) ||
          c.telegramUserId.includes(q),
      )
    : all;
  // A digits only query that matches no known account can still be assigned
  // directly as a raw Telegram user id.
  const rawIdOption =
    /^\d+$/.test(q) && !all.some((c) => c.telegramUserId === q) ? q : null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-body-strong">Telegram account</div>
          <div className="t-caption" style={{ color: "var(--text-faint)" }}>
            {linked
              ? member.username
                ? `Linked · @${member.username}`
                : `Linked · id ${member.telegramUserId}`
              : "Not linked · this member can't open the app yet."}
          </div>
        </div>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : linked ? "Change" : "Link"}
        </Button>
      </div>

      {open && (
        <div
          style={{
            display: "grid",
            gap: 6,
            padding: 10,
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>
            Assign account
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by @username or name"
            disabled={busy}
            style={{ ...memberInput, height: 40 }}
          />
          {candidates.isLoading && (
            <span className="t-caption" style={{ color: "var(--text-muted)" }}>
              Loading accounts...
            </span>
          )}
          {!candidates.isLoading && list.length === 0 && !rawIdOption && (
            <span className="t-caption" style={{ color: "var(--text-muted)" }}>
              {q
                ? "No account matches this search."
                : "No known accounts yet. Search by @username, or type a numeric Telegram user id."}
            </span>
          )}
          {list.map((c) => (
            <button
              key={c.telegramUserId}
              disabled={busy}
              onClick={() =>
                doAssign({
                  telegramUserId: c.telegramUserId,
                  username: c.username,
                })
              }
              style={{
                display: "grid",
                gap: 2,
                textAlign: "left",
                minHeight: 44,
                padding: "6px 8px",
                borderRadius: "var(--r-sm)",
                border: "none",
                background: "transparent",
                color: "var(--text)",
                cursor: busy ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  className="t-body-strong"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.displayName ?? `User ${c.telegramUserId}`}
                </span>
                {c.username && (
                  <span
                    className="t-caption"
                    style={{ color: "var(--accent)", flexShrink: 0, fontSize: 11 }}
                  >
                    @{c.username}
                  </span>
                )}
              </span>
              <span className="t-caption" style={{ color: "var(--text-faint)" }}>
                {c.memberName
                  ? `Currently ${c.memberName} · assigning swaps the two`
                  : "Seen in chat · not assigned to a member"}
              </span>
            </button>
          ))}

          {rawIdOption && (
            <button
              disabled={busy}
              onClick={() => doAssign({ telegramUserId: rawIdOption })}
              style={{
                display: "grid",
                gap: 2,
                textAlign: "left",
                minHeight: 44,
                padding: "6px 8px",
                borderRadius: "var(--r-sm)",
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                color: "var(--text)",
                cursor: busy ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              <span className="t-body-strong">Assign id {rawIdOption}</span>
              <span className="t-caption" style={{ color: "var(--text-faint)" }}>
                Not a known account · uses the raw Telegram user id
              </span>
            </button>
          )}

          {linked && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => doAssign({ telegramUserId: null })}
            >
              Unlink this account
            </Button>
          )}
        </div>
      )}

      {busy && (
        <span className="t-caption" style={{ color: "var(--accent)" }}>
          Updating...
        </span>
      )}
      {error && (
        <span className="t-caption" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onClick,
  busy,
  disabled,
}: {
  label: string;
  hint: string;
  on: boolean;
  onClick: () => Promise<unknown>;
  busy?: boolean;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const isBusy = busy || working;
  const isDisabled = disabled || working;

  async function handleClick() {
    if (isDisabled) return;
    setError(null);
    setWorking(true);
    try {
      await onClick();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this setting.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-body-strong">{label}</div>
          <div className="t-caption" style={{ color: "var(--text-faint)" }}>{hint}</div>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-busy={isBusy || undefined}
          onClick={handleClick}
          disabled={isDisabled}
          style={{
            flexShrink: 0,
            width: 50,
            height: 30,
            borderRadius: 999,
            border: isBusy
              ? "1px solid var(--accent)"
              : "1px solid var(--border-strong)",
            padding: 3,
            cursor: isDisabled ? "not-allowed" : "pointer",
            opacity: isDisabled && !isBusy ? 0.5 : 1,
            background: on ? "var(--accent)" : "var(--surface-3)",
            transition: "background var(--dur-fast), border-color var(--dur-fast), opacity var(--dur-fast)",
            display: "flex",
            justifyContent: on ? "flex-end" : "flex-start",
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#fff",
              transition: "transform var(--dur-fast), opacity var(--dur-fast)",
              opacity: isBusy ? 0.62 : 1,
            }}
          />
        </button>
      </div>
      {isBusy && (
        <span className="t-caption" style={{ color: "var(--accent)" }}>
          Updating...
        </span>
      )}
      {error && (
        <span className="t-caption" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

function CurrencyPicker({
  value,
  busy,
  onChange,
}: {
  value: string;
  busy: boolean;
  onChange: (currency: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCurrency, setSavingCurrency] = useState<string | null>(null);
  const isSaving = busy || savingCurrency !== null;

  async function choose(currency: string) {
    if (currency === value) {
      setOpen(false);
      return;
    }

    setError(null);
    setSavingCurrency(currency);
    try {
      await onChange(currency);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save currency.");
    } finally {
      setSavingCurrency(null);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        width: "min(196px, 100%)",
        display: "grid",
        gap: 8,
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={isSaving || undefined}
        onClick={() => !isSaving && setOpen((current) => !current)}
        disabled={isSaving}
        style={{
          minHeight: 40,
          width: "100%",
          padding: "0 12px",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border-strong)",
          background: "var(--surface-3)",
          color: "var(--text)",
          cursor: isSaving ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontFamily: "inherit",
          transition:
            "border-color var(--dur-fast), background var(--dur-fast), opacity var(--dur-fast)",
          opacity: isSaving ? 0.78 : 1,
        }}
      >
        <span className="t-body-strong">{value}</span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRight: "2px solid var(--text-muted)",
            borderBottom: "2px solid var(--text-muted)",
            transform: open ? "rotate(225deg) translate(-2px, -2px)" : "rotate(45deg)",
            transition: "transform var(--dur-fast)",
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Currency"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 10,
            width: "min(236px, calc(100vw - 48px))",
            padding: 6,
            borderRadius: "var(--r-lg)",
            border: "1px solid var(--border)",
            background: "var(--surface-elevated)",
            boxShadow: "0 18px 44px rgba(0, 0, 0, 0.28)",
            display: "grid",
            gap: 2,
          }}
        >
          {CURRENCIES.map((currency) => {
            const selected = currency === value;
            const savingThis = savingCurrency === currency;

            return (
              <button
                key={currency}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(currency)}
                disabled={isSaving}
                style={{
                  minHeight: 38,
                  padding: "0 10px",
                  border: "none",
                  borderRadius: "var(--r-md)",
                  background: selected ? "var(--accent-soft)" : "transparent",
                  color: selected ? "var(--accent)" : "var(--text)",
                  cursor: isSaving ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span className="t-body-strong">{currency}</span>
                <span
                  className="t-caption"
                  style={{
                    color: savingThis
                      ? "var(--accent)"
                      : selected
                        ? "var(--text-muted)"
                        : "var(--text-faint)",
                  }}
                >
                  {savingThis ? "Saving..." : selected ? "Current" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isSaving && (
        <span className="t-caption" style={{ color: "var(--accent)" }}>
          Saving currency...
        </span>
      )}
      {error && (
        <span className="t-caption" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

function Badge({ children, variant }: { children: React.ReactNode; variant: "accent" | "positive" }) {
  const color = variant === "positive" ? "var(--positive)" : "var(--accent)";
  const soft = variant === "positive" ? "var(--positive-soft)" : "var(--accent-soft)";
  return (
    <span
      className="t-caption"
      style={{
        flexShrink: 0,
        padding: "2px 8px",
        borderRadius: "var(--r-full)",
        background: soft,
        color,
        fontWeight: 700,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h2 className="t-mono-label" style={{ color: "var(--text-muted)", margin: 0 }}>
        {title}
      </h2>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: 16,
          display: "grid",
          gap: 12,
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        minHeight: 36,
      }}
    >
      <span className="t-body" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="t-label"
          style={{
            flex: 1,
            minWidth: 0,
            height: 30,
            padding: "0 12px",
            borderRadius: "var(--r-sm)",
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: value === o.value ? 600 : 500,
            background: value === o.value ? "var(--accent)" : "transparent",
            color: value === o.value ? "#fff" : "var(--text-muted)",
            transition: "background var(--dur-fast), color var(--dur-fast)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const memberInput: React.CSSProperties = {
  flex: 1,
  height: 36,
  padding: "0 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 16,
  fontFamily: "inherit",
};
