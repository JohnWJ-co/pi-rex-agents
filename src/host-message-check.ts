import assert from "node:assert/strict";
import { rewriteRexHostText } from "./host-message.ts";

const original = {
  content:
    "Worktree result retained for review:\n" +
    "  /worktree remove window:abc\n" +
    '  worktree_remove({ target: "/tmp/wt" })\n' +
    "Operator override after independent safety checks:\n" +
    "  herdr worktree remove --workspace window:abc\n",
  details: {
    worktree: { workspaceId: "window:abc", path: "/tmp/wt" },
    resultContent:
      "Operator override after independent safety checks:\n" +
      "  herdr worktree remove --workspace window:abc\n",
  },
};
const rewritten = rewriteRexHostText(original);
assert.match(
  String(rewritten.content),
  /^  rex window close window:abc$/m,
);
assert.doesNotMatch(String(rewritten.content), /herdr worktree remove/);
assert.match(
  String(rewritten.details?.resultContent),
  /^  rex window close window:abc$/m,
);
assert.doesNotMatch(String(rewritten.details?.resultContent), /herdr worktree remove/);
assert.equal(rewritten.details?.worktree, original.details.worktree);

const untouched = { content: "nothing to rewrite" };
assert.equal(rewriteRexHostText(untouched), untouched);

console.log("host message rewrite OK");
