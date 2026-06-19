import { createDb } from "../db.js";
import { listSettlements, listLiveExpenses, listSettlementAllocations } from "../repo.js";
import {
  settlements,
  settlementAllocations,
  groups,
} from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import { decimalToCents, centsToDecimal } from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const db = createDb(DATABASE_URL);

async function run() {
  // Fetch all groups.
  const allGroups = await db.select({ id: groups.id, name: groups.name }).from(groups);
  console.log(`Processing ${allGroups.length} group(s)…`);

  for (const g of allGroups) {
    const groupSettlements = await listSettlements(db, g.id);
    const existingAllocations = await listSettlementAllocations(db, g.id);
    const allocatedSettlementIds = new Set(existingAllocations.map((a) => a.settlementId));

    const unallocated = groupSettlements.filter((s) => !allocatedSettlementIds.has(s.id));
    if (unallocated.length === 0) {
      console.log(`  [${g.name}] all settlements already have allocations — skipping`);
      continue;
    }

    const liveExpenses = await listLiveExpenses(db, g.id);
    console.log(`  [${g.name}] backfilling ${unallocated.length} settlement(s)`);

    for (const s of unallocated) {
      // Determine the candidate expenses.
      const expenseIdHints = (s.expenseIds as string[] | null) ?? [];
      let candidates = expenseIdHints.length > 0
        ? liveExpenses.filter((e) => expenseIdHints.includes(e.expense.id))
        : liveExpenses.filter(
            (e) =>
              e.expense.payerMemberId === s.toMemberId &&
              e.shares.some((sh) => sh.memberId === s.fromMemberId),
          );

      // Sort oldest-first.
      candidates = [...candidates].sort(
        (a, b) => a.expense.occurredAt.getTime() - b.expense.occurredAt.getTime(),
      );

      let remaining = decimalToCents(s.amount);
      const rows: { settlementId: string; expenseId: string; memberId: string; allocatedAmount: string }[] = [];

      for (const e of candidates) {
        if (remaining <= 0) break;
        const share = e.shares.find((sh) => sh.memberId === s.fromMemberId);
        if (!share) continue;
        const shareCents = decimalToCents(share.shareAmount);
        const give = Math.min(remaining, shareCents);
        if (give > 0) {
          rows.push({
            settlementId: s.id,
            expenseId: e.expense.id,
            memberId: s.fromMemberId,
            allocatedAmount: centsToDecimal(give),
          });
          remaining -= give;
        }
      }

      if (rows.length === 0) {
        console.log(`    settlement ${s.id} (${s.amount}) — no matching expenses found, skipping`);
        continue;
      }

      await db.insert(settlementAllocations).values(rows);
      // Also ensure expenseIds is populated on the settlement row for history display.
      if (expenseIdHints.length === 0) {
        const eids = [...new Set(rows.map((r) => r.expenseId))];
        await db.update(settlements).set({ expenseIds: eids }).where(eq(settlements.id, s.id));
      }
      console.log(`    settlement ${s.id} (${s.amount}) → wrote ${rows.length} allocation(s)`);
    }
  }

  console.log("Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
