// Chat actions a super admin asks for; the AI only names the action and words.

export const ACTION_KINDS = [
  "settle",
  "approve_drafts",
  "dismiss_drafts",
  "add_expense",
  "delete_expense",
  "delete_payment",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface ActionRequest {
  action: ActionKind;
  /** A name or "me". */
  from?: string;
  to?: string;
  amount?: string;
  description?: string;
  /** Empty means everyone. */
  participants?: string[];
  match?: string;
}

export interface ActionOption {
  id: string;
  label: string;
}

export interface ActionPlan {
  kind: ActionKind;
  title: string;
  payload: Record<string, unknown>;
  options: ActionOption[];
  multi: boolean;
  selected: number[];
}

export type PlanResult = { plan: ActionPlan } | { message: string };
