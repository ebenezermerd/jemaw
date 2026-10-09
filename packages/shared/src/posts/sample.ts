/** Sample data for previews when no group is picked. */
import type { PostData } from "./compose.js";
import type { PostUseCase } from "./designs.js";

export const SAMPLE_POST_DATA: { [K in PostUseCase]: Extract<PostData, { useCase: K }> } = {
  weekly: {
    useCase: "weekly",
    data: {
      groupName: "jemaw",
      currency: "ETB",
      periodLabel: "Oct 3 – Oct 9",
      spentCents: 205000,
      expenseCount: 3,
      settledCents: 100000,
      memberCount: 3,
      standings: [
        { name: "Ebenezer", netCents: 43600 },
        { name: "Tsin", netCents: 3900 },
        { name: "Pomi", netCents: -47500 },
      ],
      debts: [
        { from: "Pomi", to: "Ebenezer", cents: 43600 },
        { from: "Pomi", to: "Tsin", cents: 3900 },
      ],
      expenses: [
        { description: "Dinner", cents: 50000, payer: "Tsin", date: "Oct 8" },
        { description: "Lunch", cents: 90000, payer: "Ebenezer", date: "Oct 8" },
        { description: "Lunch", cents: 65000, payer: "Ebenezer", date: "Oct 3" },
      ],
      narrative: "Lunch has now beaten dinner three weeks running. Someone should cook.",
    },
  },
  ai_payments: {
    useCase: "ai_payments",
    data: {
      currency: "ETB",
      name: "Pomi",
      owes: [
        { name: "Ebenezer", cents: 43600 },
        { name: "Tsin", cents: 3900 },
      ],
      owedBy: [],
      note: "Two paybacks and you're free. Ebenezer is already counting.",
    },
  },
  ai_report: {
    useCase: "ai_report",
    data: {
      title: "Spending this month",
      html: "Spent this month: <b>2,050 ETB</b>\nThis week 2,050 ETB · this month 2,050 ETB · all time 18,020 ETB (10 expenses)\nTop spender this month: <b>Ebenezer</b> (1,550 ETB)\nBiggest expense: Groceries · 5,000 ETB by <b>Tsin</b>",
      note: "Lunch is the group's real landlord.",
    },
  },
  announcement: {
    useCase: "announcement",
    data: {
      title: "Weekly reports got a makeover",
      body: "Your Thursday digest now comes with a picture of the week and a proper table.\n\nTap Open Jemaw to see the details.",
    },
  },
  release: {
    useCase: "release",
    data: {
      title: "Jemaw gets prettier",
      version: "1.6",
      intro: "A round of polish across the bot and the app.",
      added: ["Weekly reports with a picture of the week", "Ask Jemaw what you still owe and get a checklist"],
      improved: ["Profile photos everywhere instead of letters"],
      fixed: ["Removed members no longer appear in new expenses"],
    },
  },
};
