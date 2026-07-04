# Whole unit splits and Telegram identity reassignment

Date: 2026-07-04

## Problem

1. Equal and weighted splits currently distribute leftover cents onto members,
   so debtors owe awkward fractional amounts (33.34, 33.33, ...) that nobody
   pays exactly. The coverage tolerance patches this at settle time, but the
   ghost cents still exist in shares and balances.
2. Member identity can be provisioned to the wrong Telegram user. Manually
   added members get a synthetic negative `telegram_user_id`; when the real
   person later speaks in the chat, member sync creates a duplicate row with
   the real id, and the app then identifies them as the duplicate instead of
   the account that holds their expense history. There is no way to fix a
   wrong link or associate an existing account with its real user.

## Decision 1: payer absorbs the cents

For `equal` and `shares` splits, each member's computed share is floored down
to a whole currency unit (a multiple of 100 cents). The difference between the
expense amount and the sum of shares is absorbed by the payer: it is never
assigned to any member, never appears as debt, and the expense counts as fully
covered once every member pays their whole unit share. This is deliberately to
the payer's disadvantage.

- `splits.ts` floors each weighted share to whole units and no longer rotates
  remainder cents across members. The seed based remainder bearer logic and
  `expenseSeed` input are removed. Shares may now sum to less than the total.
- `balances.ts` credits the payer with the sum of the expense's shares rather
  than the full expense amount, so the absorbed remainder never lingers as a
  positive net the payer is owed. The zero sum invariant holds by construction.
- `exact` splits and loans are untouched: those amounts are typed explicitly
  and must still sum to the total.
- The stored expense amount stays what the payer actually paid; history and
  detail screens keep showing the true amount.
- Degenerate case: an amount below one unit per member floors to zero shares
  and the payer absorbs everything. Accepted as consistent with the rule.

## Decision 2: admin controlled Telegram account assignment

Admins can switch, link, or unlink the Telegram account behind any member from
Settings.

- `PATCH /api/groups/:groupId/members/:memberId/telegram` (admin only) with
  `{ telegramUserId: string | null, username?: string | null }`.
  - `null` unlinks: the member gets a fresh synthetic negative id.
  - If the target id belongs to another member of the group, the two members
    swap Telegram ids and usernames in one transaction, so crossed identities
    are fixed in a single action and taking over an id from an auto created
    duplicate leaves that duplicate unlinked.
  - Otherwise the id is assigned directly.
- `GET /api/groups/:groupId/members/telegram-candidates` (admin only) lists
  assignable identities: every linked member's current account plus distinct
  chat message senders not attached to any member, with names resolved via the
  bot API when available.
- `MemberDto` gains `telegramLinked` (true when the stored id is a real
  positive Telegram id).
- Settings member editor gains a Telegram account section: shows the current
  link state, lists candidates to pick from (annotated with which member holds
  each account), allows manual numeric id entry, and offers unlink.

## Testing

Unit tests for the new split math and balance crediting; integration tests for
the reassignment endpoint (swap, direct assign, unlink, admin guard) and the
candidates endpoint. Full workspace typecheck and test run before each commit.
