/** TanStack Query hooks over the Jemaw API. */
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  GroupDto,
  BalanceDto,
  ExpenseDto,
  HistoryResponse,
  CreateExpenseInput,
  MemberDto,
  SettlePlanResponse,
  SettlementDto,
  CreateSettlementInput,
  SuggestionsResponse,
  MeSummaryDto,
  TelegramCandidatesResponse,
  AssignTelegramInput,
} from "@jemaw/shared/types";
import { api, getGroupId } from "./api.js";

function gid(): string {
  const id = getGroupId();
  if (!id) throw new Error("No group context");
  return id;
}

export function useGroup() {
  return useQuery({
    queryKey: ["group"],
    queryFn: () => api.get<GroupDto>(`/api/groups/${gid()}`),
  });
}

export function useBalances() {
  return useQuery({
    queryKey: ["balances"],
    queryFn: () => api.get<BalanceDto[]>(`/api/groups/${gid()}/balances`),
  });
}

export function useMeSummary() {
  return useQuery({
    queryKey: ["me-summary"],
    queryFn: () => api.get<MeSummaryDto>(`/api/groups/${gid()}/me/summary`),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { defaultCurrency?: string }) =>
      api.patch<GroupDto>(`/api/groups/${gid()}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group"] });
      qc.invalidateQueries({ queryKey: ["me-summary"] });
    },
  });
}

/** Admin only: clear this group's ledger, then refresh everything. */
export function useResetGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<GroupDto>(`/api/groups/${gid()}/reset`, {}),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Live expenses. Pass `forMember` to drop entries that member has already
 * settled (their share allocated within tolerance), so the settle form never
 * lists an expense the payer has already cleared.
 */
export function useExpenses(forMember?: string) {
  const q = forMember ? `?forMember=${forMember}` : "";
  return useQuery({
    queryKey: ["expenses", forMember ?? "all"],
    queryFn: () => api.get<ExpenseDto[]>(`/api/groups/${gid()}/expenses${q}`),
  });
}

export function useHistory(memberId?: string) {
  const q = memberId ? `?memberId=${memberId}` : "";
  return useQuery({
    queryKey: ["history", memberId ?? "all"],
    queryFn: () =>
      api.get<HistoryResponse>(`/api/groups/${gid()}/history${q}`),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) =>
      api.post<ExpenseDto>(`/api/groups/${gid()}/expenses`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["group"] });
    },
  });
}

export function useExpense(expenseId: string | undefined) {
  return useQuery({
    queryKey: ["expense", expenseId],
    enabled: Boolean(expenseId),
    queryFn: () =>
      api.get<ExpenseDto>(`/api/groups/${gid()}/expenses/${expenseId}`),
  });
}

export function useEditExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { expenseId: string; input: CreateExpenseInput }) =>
      api.patch<ExpenseDto>(
        `/api/groups/${gid()}/expenses/${args.expenseId}`,
        args.input,
      ),
    onSuccess: () => invalidateLedger(qc),
  });
}

export function useVoidExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) =>
      api.post<{ ok: true }>(
        `/api/groups/${gid()}/expenses/${expenseId}/void`,
        {},
      ),
    onSuccess: () => invalidateLedger(qc),
  });
}

export function useSettlePlan() {
  return useQuery({
    queryKey: ["settle"],
    queryFn: () => api.get<SettlePlanResponse>(`/api/groups/${gid()}/settle`),
  });
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toMemberId: string) =>
      api.post<SettlementDto>(`/api/groups/${gid()}/settlements`, {
        toMemberId,
      }),
    onSuccess: () => invalidateLedger(qc),
  });
}

/** Record a settlement with full form details (settle form). */
export function useCreateSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSettlementInput) =>
      api.post<SettlementDto>(`/api/groups/${gid()}/settlements`, input),
    onSuccess: () => invalidateLedger(qc),
  });
}

export function useDeleteSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) =>
      api.delete<{ ok: true }>(
        `/api/groups/${gid()}/settlements/${settlementId}`,
      ),
    onSuccess: () => invalidateLedger(qc),
  });
}

function invalidateLedger(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "balances",
    "expenses",
    "history",
    "settle",
    "group",
    "suggestions",
    "me-summary",
  ]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      api.post<MemberDto>(`/api/groups/${gid()}/members`, { displayName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group"] }),
  });
}

export function useRenameMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { memberId: string; displayName: string }) =>
      api.patch<MemberDto>(`/api/groups/${gid()}/members/${args.memberId}`, {
        displayName: args.displayName,
      }),
    onSuccess: () => invalidateLedger(qc),
  });
}

/** Admin only: promote/demote a member. */
export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { memberId: string; role: "admin" | "member" }) =>
      api.patch<MemberDto>(
        `/api/groups/${gid()}/members/${args.memberId}/role`,
        { role: args.role },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group"] }),
  });
}

/** Admin only: set a member primary/secondary (default-included in splits). */
export function useSetMemberPrimary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { memberId: string; isPrimary: boolean }) =>
      api.patch<MemberDto>(
        `/api/groups/${gid()}/members/${args.memberId}/primary`,
        { isPrimary: args.isPrimary },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group"] }),
  });
}

/** Admin only: assignable Telegram identities for the account switcher. */
export function useTelegramCandidates(enabled: boolean) {
  return useQuery({
    queryKey: ["telegram-candidates"],
    enabled,
    queryFn: () =>
      api.get<TelegramCandidatesResponse>(
        `/api/groups/${gid()}/members/telegram-candidates`,
      ),
  });
}

/** Admin only: assign, swap, or unlink a member's Telegram account. */
export function useAssignMemberTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { memberId: string; input: AssignTelegramInput }) =>
      api.patch<MemberDto>(
        `/api/groups/${gid()}/members/${args.memberId}/telegram`,
        args.input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group"] });
      qc.invalidateQueries({ queryKey: ["telegram-candidates"] });
    },
  });
}

export function useSuggestions() {
  return useQuery({
    queryKey: ["suggestions"],
    queryFn: () =>
      api.get<SuggestionsResponse>(`/api/groups/${gid()}/suggestions`),
    // Poll while a scan may be in flight; cheap and simple (plan §11 polling).
    refetchInterval: (q) =>
      q.state.data?.scanning ? 4000 : false,
  });
}

/** Trigger a Gemini scan on the server. Fire and forget — never throws. */
export function useTriggerScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/api/groups/${gid()}/scan`, {}),
    // Swallow errors: a scan that fails (AI unconfigured, rate limited, offline)
    // must never bubble up and break the screen that triggered it — least of all
    // the boot path, where it would freeze the splash.
    onError: () => {},
    onSettled: () => {
      // Invalidate suggestions so the UI picks up any new results.
      qc.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });
}

/**
 * Pull-to-refresh handler: re-fetch everything, and on the Home/Suggestions
 * screens also kick a fresh Gemini scan. Resolves when done.
 */
export function useRefresh() {
  const qc = useQueryClient();
  return async (opts?: { scan?: boolean }) => {
    if (opts?.scan) {
      try {
        await api.post(`/api/groups/${gid()}/scan`, {});
      } catch {
        // AI not configured or failed — still refresh the data below.
      }
    }
    await qc.invalidateQueries();
  };
}

export function useConfirmSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/groups/${gid()}/suggestions/${id}/confirm`, {}),
    onSuccess: () => invalidateLedger(qc),
  });
}

/** Confirm a suggestion with an explicit amount (vague settlements). */
export function useConfirmSuggestionWithAmount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; amount?: string }) =>
      api.post(`/api/groups/${gid()}/suggestions/${args.id}/confirm`, {
        amount: args.amount,
      }),
    onSuccess: () => invalidateLedger(qc),
  });
}

export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/groups/${gid()}/suggestions/${id}/dismiss`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
  });
}

export function useEditSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: CreateExpenseInput }) =>
      api.post(`/api/groups/${gid()}/suggestions/${args.id}/edit`, args.input),
    onSuccess: () => invalidateLedger(qc),
  });
}

export function useEditSettlementSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: CreateSettlementInput }) =>
      api.post<SettlementDto>(
        `/api/groups/${gid()}/suggestions/${args.id}/edit`,
        args.input,
      ),
    onSuccess: () => invalidateLedger(qc),
  });
}
