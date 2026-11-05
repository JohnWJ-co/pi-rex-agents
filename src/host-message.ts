/**
 * Rex-specific host text cleanup for delivered messages.
 *
 * The orchestration kernel's delivery and presentation text is host-neutral
 * except for literals that name its original host: one executable worktree
 * cleanup line, and a few labels. Rewrite those into Rex terms before a
 * message reaches the model or the transcript.
 */
import { rexifyText } from "./rex-wording.ts";

export interface WorktreeMessageDetails {
  worktree?: {
    workspaceId?: string;
    path?: string;
  };
  /** A pre-rendered copy kept by upstream for the custom message renderer. */
  resultContent?: unknown;
}

function rewriteText(content: string, workspaceId: string | undefined): string {
  const rexified = rexifyText(content);
  if (!workspaceId) return rexified;
  const escaped = workspaceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rexified.replace(
    new RegExp(`^  herdr worktree remove --workspace ${escaped}$`, "gm"),
    `  rex window close ${workspaceId}`,
  );
}

export function rewriteRexHostText<T extends { content?: unknown }>(
  message: T,
): T {
  const details = (message as { details?: WorktreeMessageDetails }).details;
  const workspaceId = details?.worktree?.workspaceId;

  let changed = false;
  let content = message.content;
  if (typeof content === "string") {
    const next = rewriteText(content, workspaceId);
    if (next !== content) {
      content = next;
      changed = true;
    }
  }

  let nextDetails = details;
  if (typeof details?.resultContent === "string") {
    const next = rewriteText(details.resultContent, workspaceId);
    if (next !== details.resultContent) {
      nextDetails = { ...details, resultContent: next };
      changed = true;
    }
  }

  if (!changed) return message;
  return { ...message, ...(content !== message.content ? { content } : {}), details: nextDetails } as T;
}
