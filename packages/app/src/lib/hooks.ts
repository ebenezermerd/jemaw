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
