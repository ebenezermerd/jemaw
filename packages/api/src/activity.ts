/**
 * One time-ordered feed of everything that happens: console actions, AI scans,
 * bot replies, drafts and settlements. Built as a UNION ALL over a common
 * projection so filters and paging run in Postgres with a true total.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "./db.js";
import type {
  AdminActivityItemDto,
  AdminActivityPageDto,
  AdminActivitySeverity,
  AdminActivitySource,
} from "@jemaw/shared/types";

export const ACTIVITY_SOURCES: AdminActivitySource[] = ["console", "scan", "reply", "draft", "settlement"];
export const ACTIVITY_SEVERITIES: AdminActivitySeverity[] = ["info", "warn", "error"];

const FEED = sql`
  select a.id::text as id, 'console' as source, 'info' as severity,
         g.id as group_id, g.name as group_name, a.actor_email as actor, a.action as action,
         a.detail || jsonb_build_object('targetType', a.target_type, 'targetId', a.target_id) as detail,
         a.created_at as at
    from admin_audit_log a
    left join groups g on g.id::text = a.target_id
  union all
  select r.id::text, 'scan',
         case when r.status = 'success' then 'info' else 'error' end,
         g.id, g.name, coalesce(m.display_name, 'Jemaw'), 'scan.' || r.status,
         jsonb_build_object(
           'trigger', r.trigger_type, 'inputTokens', r.input_tokens, 'outputTokens', r.output_tokens,
           'durationMs', r.duration_ms,
           'drafts', (select count(*) from suggestions s where s.ai_run_id = r.id)),
         r.created_at
    from ai_runs r
    join groups g on g.id = r.group_id
    left join members m on m.id = r.triggered_by_member_id
  union all
  select b.id::text, 'reply',
         case b.decision when 'failed' then 'error' when 'suppressed' then 'warn' else 'info' end,
         g.id, g.name, 'Jemaw', 'reply.' || b.decision,
         jsonb_build_object(
           'trigger', b.trigger_event, 'channel', b.channel, 'reason', b.suppression_reason,
           'text', b.selected_text, 'style', b.selected_style, 'model', b.model,
           'provider', b.provider, 'latencyMs', b.latency_ms, 'risk', b.risk_class),
         b.created_at
    from bot_replies b
    join groups g on g.id = b.group_id
  union all
  select s.id::text, 'draft', 'info',
         g.id, g.name, coalesce(m.display_name, 'Jemaw'), 'draft.' || s.status,
         jsonb_build_object(
           'kind', s.kind, 'description', s.description, 'amount', s.amount,
           'currency', g.default_currency, 'confidence', s.confidence),
         coalesce(s.resolved_at, s.created_at)
    from suggestions s
    join groups g on g.id = s.group_id
    left join members m on m.id = s.resolved_by_member_id
  union all
  select st.id::text, 'settlement', 'info',
         g.id, g.name, f.display_name, 'settlement.' || st.method,
         jsonb_build_object(
           'from', f.display_name, 'to', t.display_name, 'amount', st.amount,
           'currency', st.currency, 'method', st.method),
         st.created_at
    from settlements st
    join groups g on g.id = st.group_id
    join members f on f.id = st.from_member_id
    join members t on t.id = st.to_member_id
`;

interface FeedRow {
  id: string;
  source: AdminActivitySource;
  severity: AdminActivitySeverity;
  group_id: string | null;
  group_name: string | null;
  actor: string | null;
  action: string;
  detail: Record<string, unknown>;
  at: Date | string;
  total: string | number;
}

export async function listActivity(
  db: Db,
  opts: {
    source?: AdminActivitySource;
    severity?: AdminActivitySeverity;
    groupId?: string;
    limit: number;
    offset: number;
  },
): Promise<AdminActivityPageDto> {
  const where: SQL[] = [];
  if (opts.source) where.push(sql`source = ${opts.source}`);
  if (opts.severity) where.push(sql`severity = ${opts.severity}`);
  if (opts.groupId) where.push(sql`group_id = ${opts.groupId}::uuid`);
  const filter = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;
  const rows = (await db.execute(sql`
    select *, count(*) over () as total
      from (${FEED}) feed
      ${filter}
     order by at desc, id
     limit ${opts.limit} offset ${opts.offset}
  `)) as unknown as FeedRow[];
  let total = rows[0] ? Number(rows[0].total) : 0;
  // Paged past the end: the window count is gone, so count separately.
  if (rows.length === 0 && opts.offset > 0) {
    const [c] = (await db.execute(sql`select count(*) as n from (${FEED}) feed ${filter}`)) as unknown as {
      n: string;
    }[];
    total = Number(c?.n ?? 0);
  }
  return {
    total,
    items: rows.map((r) => {
      const item = {
        id: r.id,
        source: r.source,
        severity: r.severity,
        groupId: r.group_id,
        groupName: r.group_name,
        actor: r.actor,
        action: r.action,
        detail: r.detail ?? {},
        at: new Date(r.at).toISOString(),
      };
      return { ...item, summary: summarize(item) };
    }),
  };
}

const CONSOLE_VERBS: Record<string, string> = {
  "user.suspend": "Suspended a user",
  "user.activate": "Reactivated a user",
  "announcement.draft": "Saved an announcement draft",
  "announcement.queue": "Queued an announcement",
  "announcement.send": "Sent an announcement",
  "announcement.delete": "Deleted an announcement draft",
  "config.update": "Changed a setting",
  "bot.config": "Changed the bot settings",
  "group.update": "Edited a group",
  "group.humor": "Changed a group's bot settings",
  "group.reset": "Reset a group's ledger",
  "group.delete": "Deleted a group",
  "group.access": "Changed a group's access",
  "member.update": "Changed a member",
  "admin.add": "Added a console admin",
  "admin.role": "Changed a console admin's role",
  "admin.remove": "Removed a console admin",
};

const SCAN_TEXT: Record<string, string> = {
  "scan.parse_error": "Scan failed: the AI's answer could not be read",
  "scan.api_error": "Scan failed: the AI provider returned an error",
};

/** One readable sentence per row. Exported for tests. */
export function summarize(i: Omit<AdminActivityItemDto, "summary">): string {
  const d = i.detail as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v));
  switch (i.source) {
    case "console": {
      const verb = CONSOLE_VERBS[i.action] ?? i.action;
      const target = i.groupName ?? (d.targetId ? `${str(d.targetType)} ${str(d.targetId)}`.trim() : "");
      return target ? `${verb} · ${target}` : verb;
    }
    case "scan":
      if (i.action === "scan.success") {
        const n = Number(d.drafts ?? 0);
        return `Scanned the chat (${str(d.trigger)}) and found ${n} draft${n === 1 ? "" : "s"}`;
      }
      return SCAN_TEXT[i.action] ?? `Scan ${i.action.slice(5)}`;
    case "reply":
      if (i.action === "reply.sent") return `Replied${d.trigger ? ` to ${str(d.trigger).replace(/_/g, " ")}` : ""}: “${str(d.text).slice(0, 140)}”`;
      if (i.action === "reply.suppressed") return `Stayed quiet${d.reason ? `: ${str(d.reason).replace(/_/g, " ")}` : ""}`;
      return `Reply failed${d.reason ? `: ${str(d.reason)}` : ""}`;
    case "draft": {
      const amount = d.amount != null ? ` · ${str(d.amount)} ${str(d.currency)}` : "";
      const status = i.action.slice(6);
      const what = `“${str(d.description)}”${amount}`;
      return status === "pending" ? `Drafted ${what}` : `Draft ${what} ${status}`;
    }
    case "settlement":
      return `${str(d.from)} paid ${str(d.to)} ${str(d.amount)} ${str(d.currency)} (${str(d.method)})`;
  }
}
