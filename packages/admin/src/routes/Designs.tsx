/**
 * Message designs: choose how each kind of bot post looks (weekly report, AI
 * answers, announcements, feature releases). Edit on the left, see the post
 * on the right, send a test to a group, then save; the bot picks saved
 * designs up within a minute.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminGroupDto } from "@jemaw/shared/types";
import type { BotRuntimeConfig } from "@jemaw/shared/runtimeConfig";
import {
  composePost,
  DEFAULT_POST_DESIGNS,
  POST_USE_CASE_META,
  POST_USE_CASES,
  SAMPLE_POST_DATA,
  SECTION_LABEL,
  type PostButton,
  type PostData,
  type PostDesign,
  type PostDesigns,
  type PostLayout,
  type PostUseCase,
  type PaymentsPostData,
  type WeeklyPostData,
} from "@jemaw/shared/posts";
import { GhostButton, fieldStyle } from "../ui/Dialog.js";
import { Loader, SkeletonList } from "../ui/Loader.js";
import { Card, PrimaryButton } from "../ui/primitives.js";
import { PostPreview } from "../ui/PostPreview.js";
import { ToggleRow } from "./GroupManage.js";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

const LAYOUTS: { key: PostLayout; label: string; hint: string }[] = [
  { key: "classic", label: "Classic", hint: "Ordinary message with coloured button rows" },
  { key: "article", label: "Article", hint: "Headings, paragraphs and lists, for reports and releases" },
  { key: "showcase", label: "Showcase", hint: "Picture or slideshow, tables and buttons" },
  { key: "checklist", label: "Checklist", hint: "Tick boxes for paybacks, or a plain table" },
];

const BUTTON_STYLES: { key: PostButton["style"]; label: string; swatch: string }[] = [
  { key: "default", label: "Plain", swatch: "rgba(43,82,120,.9)" },
  { key: "primary", label: "Blue", swatch: "#3390ec" },
  { key: "success", label: "Green", swatch: "#31a24c" },
  { key: "danger", label: "Red", swatch: "#e0473f" },
];

/** The text an admin can type to see announcement, release and report previews. */
type EditableText = {
  announcement: { title: string; body: string };
  release: { title: string; version: string; intro: string; added: string; improved: string; fixed: string };
  ai_report: { title: string; html: string };
};

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export function Designs() {
  const qc = useQueryClient();
  const [useCase, setUseCase] = useState<PostUseCase>("weekly");
  const [draft, setDraft] = useState<PostDesigns | null>(null);
  const [groupId, setGroupId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [text, setText] = useState<EditableText>(() => {
    const r = SAMPLE_POST_DATA.release.data;
    return {
      announcement: { ...SAMPLE_POST_DATA.announcement.data },
      release: { title: r.title, version: r.version ?? "", intro: r.intro ?? "", added: r.added.join("\n"), improved: r.improved.join("\n"), fixed: r.fixed.join("\n") },
      ai_report: { title: SAMPLE_POST_DATA.ai_report.data.title, html: SAMPLE_POST_DATA.ai_report.data.html },
    };
  });

  const config = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<BotRuntimeConfig>("/api/admin/bot/config"),
  });
  const saved = config.data?.postDesigns ?? DEFAULT_POST_DESIGNS;
  const designs = draft ?? saved;
  const design = designs[useCase];
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(saved);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });
  const realData = useQuery({
    queryKey: ["design-data", groupId, memberId],
    queryFn: () =>
      api.get<{ weekly: WeeklyPostData; payments: PaymentsPostData; paymentsMemberId: string | null; members: { memberId: string; name: string; netCents: number }[] }>(
        `/api/admin/designs/data?groupId=${groupId}${memberId ? `&memberId=${memberId}` : ""}`,
      ),
    enabled: groupId !== "",
    placeholderData: (prev) => prev,
  });

  const input: PostData = useMemo(() => {
    const real = groupId ? realData.data : undefined;
    switch (useCase) {
      case "weekly":
        return { useCase, data: real?.weekly ?? SAMPLE_POST_DATA.weekly.data };
      case "ai_payments":
        return {
          useCase,
          data: real ? { ...real.payments, note: SAMPLE_POST_DATA.ai_payments.data.note } : SAMPLE_POST_DATA.ai_payments.data,
        };
      case "ai_report":
        return { useCase, data: { ...text.ai_report, note: SAMPLE_POST_DATA.ai_report.data.note } };
      case "announcement":
        return { useCase, data: text.announcement };
      case "release": {
        const r = text.release;
        return { useCase, data: { title: r.title, version: r.version || undefined, intro: r.intro, added: lines(r.added), improved: lines(r.improved), fixed: lines(r.fixed) } };
      }
    }
  }, [useCase, groupId, realData.data, text]);

  const post = useMemo(
    () => composePost(input, design, { openUrl: "https://t.me/jemawsbot/app" }),
    [input, design],
  );

  const set = (patch: Partial<PostDesign>) =>
    setDraft({ ...designs, [useCase]: { ...design, ...patch } });

  const save = useMutation({
    mutationFn: () => api.patch<BotRuntimeConfig>("/api/admin/bot/config", { postDesigns: designs }),
    onSuccess: (res) => {
      qc.setQueryData(["bot-config"], res);
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
  const test = useMutation({
    mutationFn: () =>
      api.post<{ mode: "rich" | "classic" | "fallback"; richError?: string }>("/api/admin/designs/test", {
        useCase,
        groupId,
        memberId: memberId || undefined,
        design,
        data: input.useCase === "weekly" || input.useCase === "ai_payments" ? undefined : input.data,
      }),
  });

  if (config.isLoading) return <SkeletonList count={4} height={120} padding={0} />;
  const meta = POST_USE_CASE_META[useCase];
  const groupName = groups.find((g) => g.id === groupId)?.name;
  const showChecklistStyle = design.layout === "checklist" || useCase === "ai_payments" || (useCase === "weekly" && design.sections.debts);
  const slideshowFits = useCase === "weekly";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div role="tablist" aria-label="Kind of post" style={{ display: "flex", gap: 7, flexWrap: "wrap", flex: 1 }}>
          {POST_USE_CASES.map((u) => (
            <Pill key={u} active={u === useCase} onClick={() => { setUseCase(u); test.reset(); }} role="tab">
              {POST_USE_CASE_META[u].label}
            </Pill>
          ))}
        </div>
        {save.isError && <span style={{ fontSize: 12.5, color: "var(--danger)" }}>{errText(save.error)}</span>}
        {dirty && <span style={{ fontSize: 12.5, color: "var(--warn)" }}>Unsaved changes</span>}
        <GhostButton onClick={() => setDraft(null)} disabled={!dirty}>Discard</GhostButton>
        <PrimaryButton onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save designs"}
        </PrimaryButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 460px)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <Heading title="Layout" hint={meta.description} />
            <div role="radiogroup" aria-label="Layout" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {LAYOUTS.map((l) => (
                <Choice key={l.key} on={design.layout === l.key} onClick={() => set({ layout: l.key })} label={l.label} hint={l.hint} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
              <Segmented
                label="Picture"
                value={design.hero}
                onChange={(hero) => set({ hero })}
                options={[
                  { key: "none", label: "None" },
                  { key: "image", label: "One image" },
                  ...(slideshowFits ? [{ key: "slideshow" as const, label: "Slideshow" }] : []),
                ]}
                hint={design.hero === "slideshow" ? "Swipes from the week's picture through a card per expense." : undefined}
              />
              {design.layout !== "classic" && (
                <Segmented
                  label="Buttons"
                  value={design.buttonsPlacement}
                  onChange={(buttonsPlacement) => set({ buttonsPlacement })}
                  options={[
                    { key: "below", label: "Below the message" },
                    { key: "inside", label: "Inside the message" },
                  ]}
                  hint={design.buttonsPlacement === "inside" ? "Telegram draws buttons inside a message itself, so their shape follows each Telegram app." : "Same rounded, coloured rows as a classic message."}
                />
              )}
              {showChecklistStyle && (
                <Segmented
                  label="Paybacks as"
                  value={design.checklistStyle}
                  onChange={(checklistStyle) => set({ checklistStyle })}
                  options={[
                    { key: "checklist", label: "Checklist" },
                    { key: "table", label: "Table, no header" },
                  ]}
                />
              )}
            </div>
          </Card>

          {meta.sections.length > 0 && (
            <Card>
              <Heading title="What to include" />
              {meta.sections.map((s) => (
                <ToggleRow
                  key={s}
                  label={SECTION_LABEL[s].label}
                  hint={SECTION_LABEL[s].hint}
                  on={design.sections[s]}
                  onChange={(v) => set({ sections: { ...design.sections, [s]: v } })}
                />
              ))}
            </Card>
          )}

          <Card>
            <Heading title="Buttons" hint="Up to three rows of three. Copy buttons get Telegram's own copy icon." />
            <ButtonsEditor rows={design.buttons} onChange={(buttons) => set({ buttons })} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>Footer</span>
              <input value={design.footer} maxLength={120} placeholder="None" onChange={(e) => set({ footer: e.target.value })} style={fieldStyle} />
            </label>
            <div style={{ marginTop: 14 }}>
              <GhostButton onClick={() => set(structuredClone(DEFAULT_POST_DESIGNS[useCase]))}>Reset this design</GhostButton>
            </div>
          </Card>

          {(useCase === "announcement" || useCase === "release" || useCase === "ai_report") && (
            <Card>
              <Heading title="Preview text" hint="Only for this preview and test sends." />
              <PreviewText useCase={useCase} text={text} onChange={setText} />
            </Card>
          )}
        </div>

        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Live preview</div>
              {realData.isFetching && <Loader size={16} />}
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-soft)", background: "rgba(110,89,199,.15)", padding: "3px 9px", borderRadius: 7 }}>
                {post.rich ? "Rich message" : "Classic message"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <select aria-label="Data" value={groupId} onChange={(e) => { setGroupId(e.target.value); setMemberId(""); test.reset(); }} style={{ ...fieldStyle, flex: 1, minWidth: 160 }}>
                <option value="">Sample numbers</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {useCase === "ai_payments" && realData.data && (
                <select aria-label="Whose payments" value={memberId || realData.data.paymentsMemberId || ""} onChange={(e) => setMemberId(e.target.value)} style={{ ...fieldStyle, flex: 1, minWidth: 140 }}>
                  {realData.data.members.map((m) => (
                    <option key={m.memberId} value={m.memberId}>{m.name}</option>
                  ))}
                </select>
              )}
            </div>
            <PostPreview post={post} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <GhostButton onClick={() => test.mutate()} disabled={!groupId || test.isPending}>
                {test.isPending ? "Sending…" : groupName ? `Send test to ${groupName}` : "Pick a group to send a test"}
              </GhostButton>
              {test.isSuccess && (
                <span style={{ fontSize: 12.5, color: test.data.mode === "fallback" ? "var(--warn)" : "var(--success)" }}>
                  {test.data.mode === "fallback" ? `Sent as a classic message: ${test.data.richError ?? "rich refused"}` : "Sent. Check the group."}
                </span>
              )}
              {test.isError && <span style={{ fontSize: 12.5, color: "var(--danger)" }}>{errText(test.error)}</span>}
            </div>
            {groupId && (useCase === "weekly" || useCase === "ai_payments") && (
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
                Real numbers from {groupName}. Jemaw's comment is written by the AI when the bot sends the post, so the preview shows a sample line.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Pill({ active, onClick, children, role }: { active: boolean; onClick: () => void; children: ReactNode; role: "tab" | "radio" }) {
  return (
    <button
      role={role}
      {...(role === "tab" ? { "aria-selected": active } : { "aria-checked": active })}
      onClick={onClick}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: active ? "#fff" : "rgba(244,242,251,.6)",
        background: active ? "rgba(110,89,199,.25)" : "transparent",
        border: `1px solid ${active ? "rgba(169,156,227,.55)" : "var(--hairline-2)"}`,
        borderRadius: 10,
        padding: "8px 13px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Choice({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "11px 13px",
        borderRadius: 11,
        cursor: "pointer",
        background: on ? "rgba(110,89,199,.22)" : "var(--bg-panel)",
        border: `1px solid ${on ? "rgba(169,156,227,.6)" : "var(--hairline-2)"}`,
        color: "var(--text)",
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.35 }}>{hint}</div>
    </button>
  );
}

function Segmented<K extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: K;
  options: { key: K; label: string }[];
  onChange: (k: K) => void;
  hint?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((o) => (
          <Pill key={o.key} role="radio" active={o.key === value} onClick={() => onChange(o.key)}>
            {o.label}
          </Pill>
        ))}
      </div>
      {hint && <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{hint}</span>}
    </div>
  );
}

function ButtonsEditor({ rows, onChange }: { rows: PostButton[][]; onChange: (rows: PostButton[][]) => void }) {
  const update = (r: number, i: number, patch: Partial<PostButton>) =>
    onChange(rows.map((row, ri) => (ri !== r ? row : row.map((b, bi) => (bi === i ? { ...b, ...patch } : b)))));
  const remove = (r: number, i: number) =>
    onChange(rows.map((row, ri) => (ri === r ? row.filter((_, bi) => bi !== i) : row)).filter((row) => row.length));
  const add = (r: number) => {
    const fresh: PostButton = { label: "Open Jemaw", action: "open_app", style: "default" };
    onChange(r >= rows.length ? [...rows, [fresh]] : rows.map((row, ri) => (ri === r ? [...row, fresh] : row)));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No buttons.</div>}
      {rows.map((row, r) => (
        <div key={r} style={{ border: "1px solid var(--hairline-2)", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", letterSpacing: ".06em", textTransform: "uppercase" }}>Row {r + 1}</div>
          {row.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input aria-label="Button label" value={b.label} maxLength={40} onChange={(e) => update(r, i, { label: e.target.value })} style={{ ...fieldStyle, flex: "1 1 130px", padding: "8px 10px" }} />
              <select aria-label="Button action" value={b.action} onChange={(e) => update(r, i, { action: e.target.value as PostButton["action"] })} style={{ ...fieldStyle, width: 132, padding: "8px 10px" }}>
                <option value="open_app">Open Jemaw</option>
                <option value="copy_amount">Copy amount</option>
                <option value="url">Open a link</option>
              </select>
              <div role="radiogroup" aria-label="Button colour" style={{ display: "flex", gap: 4 }}>
                {BUTTON_STYLES.map((s) => (
                  <button
                    key={s.key}
                    role="radio"
                    aria-checked={b.style === s.key}
                    aria-label={s.label}
                    title={s.label}
                    onClick={() => update(r, i, { style: s.key })}
                    style={{ width: 22, height: 22, borderRadius: 7, background: s.swatch, cursor: "pointer", border: b.style === s.key ? "2px solid #fff" : "2px solid transparent" }}
                  />
                ))}
              </div>
              <button aria-label="Remove button" onClick={() => remove(r, i)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>
                ×
              </button>
              {b.action === "url" && (
                <input aria-label="Link" value={b.url ?? ""} placeholder="https://…" onChange={(e) => update(r, i, { url: e.target.value })} style={{ ...fieldStyle, flexBasis: "100%", padding: "8px 10px" }} />
              )}
            </div>
          ))}
          {row.length < 3 && (
            <button onClick={() => add(r)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: 0 }}>
              + Button in this row
            </button>
          )}
        </div>
      ))}
      {rows.length < 3 && (
        <div>
          <GhostButton onClick={() => add(rows.length)}>Add a row</GhostButton>
        </div>
      )}
    </div>
  );
}

function PreviewText({ useCase, text, onChange }: { useCase: "announcement" | "release" | "ai_report"; text: EditableText; onChange: (t: EditableText) => void }) {
  const field = (label: string, value: string, set: (v: string) => void, opts: { area?: boolean; hint?: string } = {}) => (
    <label key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{label}</span>
      {opts.area ? (
        <textarea value={value} rows={3} onChange={(e) => set(e.target.value)} style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit" }} />
      ) : (
        <input value={value} onChange={(e) => set(e.target.value)} style={fieldStyle} />
      )}
      {opts.hint && <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{opts.hint}</span>}
    </label>
  );
  const box = (children: ReactNode) => <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
  if (useCase === "announcement") {
    const a = text.announcement;
    const set = (patch: Partial<typeof a>) => onChange({ ...text, announcement: { ...a, ...patch } });
    return box([field("Title", a.title, (title) => set({ title })), field("Message", a.body, (body) => set({ body }), { area: true })]);
  }
  if (useCase === "release") {
    const r = text.release;
    const set = (patch: Partial<typeof r>) => onChange({ ...text, release: { ...r, ...patch } });
    return box([
      field("Title", r.title, (title) => set({ title })),
      field("Version", r.version, (version) => set({ version })),
      field("Intro", r.intro, (intro) => set({ intro }), { area: true }),
      field("New", r.added, (added) => set({ added }), { area: true, hint: "One item per line" }),
      field("Improved", r.improved, (improved) => set({ improved }), { area: true }),
      field("Fixed", r.fixed, (fixed) => set({ fixed }), { area: true }),
    ]);
  }
  const rep = text.ai_report;
  const set = (patch: Partial<typeof rep>) => onChange({ ...text, ai_report: { ...rep, ...patch } });
  return box([
    field("Title", rep.title, (title) => set({ title })),
    field("Answer", rep.html, (html) => set({ html }), { area: true, hint: "The AI's answer: one fact per line, lines starting with • become a list" }),
  ]);
}
