// Runs a confirmed chat action through the same write paths the app uses.
import type { Db } from "../db.js";
import type { ChatAction, Group } from "@jemaw/shared/schema";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import {
  createExpenseWithShares,
  deleteSettlement,
  getSuggestion,
  resolveSuggestion,
  voidExpense,
} from "../repo.js";
import { computeSplit } from "../domain/splits.js";
import { recordSettlement } from "../domain/recordSettlement.js";
import { confirmSuggestion } from "../domain/confirmSuggestion.js";
import { refreshGroupSummarySafe } from "../ai/summary.js";
import { formatCents } from "../ai/ledger/snapshot.js";
import type { ActionOption } from "./types.js";

export interface ActionOutcome {
  ok: boolean;
  /** Plain text for the card once it's done. */
  text: string;
}

export async function executeAction(db: Db, group: Group, action: ChatAction): Promise<ActionOutcome> {
  const options = action.options as ActionOption[];
  const picked = (action.selected as number[]).map((i) => options[i]).filter((o): o is ActionOption => o != null);
  const payload = action.payload as Record<string, unknown>;
  const cur = group.defaultCurrency;
  const actor = action.actorMemberId;
  const out = await run();
  if (out.ok) await refreshGroupSummarySafe(db, group.id);
  return out;

  async function run(): Promise<ActionOutcome> {
    switch (action.kind) {
      case "settle": {
        const res = await recordSettlement(db, group, actor, {
          fromMemberId: payload.fromMemberId as string,
          toMemberId: payload.toMemberId as string,
          expenseIds: picked.map((o) => o.id),
        });
        if ("error" in res) return { ok: false, text: `Nothing recorded: ${res.error}.` };
        const amount = formatCents(decimalToCents(res.settlement.amount));
        return {
          ok: true,
          text: `✅ Recorded: ${payload.fromName} paid ${payload.toName} ${amount} ${cur} for ${picked.map((o) => o.label.split(" · ")[0]).join(", ")}.`,
        };
      }
      case "approve_drafts": {
        const done: string[] = [];
        const skipped: string[] = [];
        for (const o of picked) {
          const s = await getSuggestion(db, group.id, o.id);
          const name = o.label.split(" · ")[0]!;
          if (!s) {
            skipped.push(`${name} (gone)`);
            continue;
          }
          const res = await confirmSuggestion(db, group, actor, s);
          if ("error" in res) skipped.push(`${name} (${res.error})`);
          else done.push(name);
        }
        const lines = [];
        if (done.length) lines.push(`✅ Added to the ledger: ${done.join(", ")}.`);
        if (skipped.length) lines.push(`Skipped: ${skipped.join("; ")}. Open the app to fix these.`);
        return { ok: done.length > 0, text: lines.join("\n") };
      }
      case "dismiss_drafts": {
        const done: string[] = [];
        for (const o of picked) {
          const s = await getSuggestion(db, group.id, o.id);
          if (!s || s.status !== "pending") continue;
          await resolveSuggestion(db, s.id, "dismissed", actor, new Date());
          done.push(o.label.split(" · ")[0]!);
        }
        return done.length
          ? { ok: true, text: `🗑 Dismissed: ${done.join(", ")}.` }
          : { ok: false, text: "Those drafts were already handled." };
      }
      case "add_expense": {
        const totalCents = decimalToCents(payload.amount as string);
        const split = computeSplit({ totalCents, splitType: "equal", memberIds: payload.splitWith as string[] });
        await createExpenseWithShares(
          db,
          {
            groupId: group.id,
            payerMemberId: payload.payerMemberId as string,
            amount: centsToDecimal(totalCents),
            kind: "expense",
            currency: cur,
            description: payload.description as string,
            createdByMemberId: actor,
            source: "manual",
            occurredAt: new Date(),
          },
          split.map((p) => ({ memberId: p.memberId, shareAmount: centsToDecimal(p.shareCents) })),
        );
        return { ok: true, text: `✅ Added "${payload.description}" · ${formatCents(totalCents)} ${cur}.` };
      }
      case "delete_expense": {
        const o = picked[0];
        if (!o) return { ok: false, text: "Nothing picked." };
        const res = await voidExpense(db, group.id, o.id, new Date());
        if (res !== "ok") return { ok: false, text: res === "already_voided" ? "That one was already deleted." : "That expense is gone." };
        return { ok: true, text: `🗑 Deleted: ${o.label}. You can restore it in the app.` };
      }
      case "delete_payment": {
        const o = picked[0];
        if (!o) return { ok: false, text: "Nothing picked." };
        const res = await deleteSettlement(db, group.id, o.id);
        if (res !== "ok") return { ok: false, text: "That payment is gone." };
        return { ok: true, text: `🗑 Deleted payment: ${o.label}.` };
      }
      default:
        return { ok: false, text: "I don't know how to do that." };
    }
  }
}
