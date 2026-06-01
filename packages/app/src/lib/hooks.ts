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
  SuggestionsResponse,
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

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.get<ExpenseDto[]>(`/api/groups/${gid()}/expenses`),
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

function invalidateLedger(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["balances", "expenses", "history", "settle", "group", "suggestions"]) {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group"] }),
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

export function useConfirmSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/groups/${gid()}/suggestions/${id}/confirm`, {}),
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
