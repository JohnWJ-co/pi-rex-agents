/**
 * Rex-specific host text cleanup.
 *
 * pi-herdr-agents owns the delivery/presentation text and is intentionally
 * host-neutral except for a Herdr operator-override line in worktree handoff
 * messages. Rewrite that one executable line so it is valid in Rex.
 */
export interface WorktreeMessageDetails {
  worktree?: {
    workspaceId?: string;
    path?: string;
  };
  /** A pre-rendered copy kept by upstream for the custom message renderer. */
  resultContent?: unknown;
}

function rewriteText(content: string, workspaceId: string | undefined): string {
  if (!workspaceId) return content;
  const escaped = workspaceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(
    new RegExp(`^  herdr worktree remove --workspace ${escaped}$`, "gm"),
    `  rex window close ${workspaceId}`,
  );
}

export function rewriteRexHostText<T extends { content?: unknown }>(message: T): T {
  const details = (message as { details?: WorktreeMessageDetails }).details;
  const workspaceId = details?.worktree?.workspaceId;
  if (!workspaceId) return message;

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
