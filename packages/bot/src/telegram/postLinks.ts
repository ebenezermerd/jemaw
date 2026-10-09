/**
 * Where a post's "Open Jemaw" buttons point: the t.me deep link that opens
 * the Mini App on this group, or the plain app URL when that isn't set up.
 */
import type { PostContext } from "@jemaw/shared/posts";

export interface PostLinks {
  botUsername?: string;
  miniAppShortName?: string;
  miniAppUrl?: string;
}

export function postContext(links: PostLinks | undefined, groupId: string): PostContext {
  if (links?.botUsername && links.miniAppShortName) {
    return { openUrl: `https://t.me/${links.botUsername}/${links.miniAppShortName}?startapp=${groupId}` };
  }
  return { openUrl: links?.miniAppUrl ?? null };
}
