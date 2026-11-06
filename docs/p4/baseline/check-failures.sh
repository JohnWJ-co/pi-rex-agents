#!/bin/bash
# 用法：npm test > /tmp/x.log 2>&1; docs/p4/baseline/check-failures.sh /tmp/x.log
# 失败集合必须是 inherited ∪ flaky ∪ expected-identity 的子集；否则列出新增失败并以 1 退出。
set -u
dir=$(cd "$(dirname "$0")" && pwd)
log=$1
allowed=$(mktemp); actual=$(mktemp)
cat "$dir"/inherited-failures.txt "$dir"/flaky.txt "$dir"/expected-identity.txt | grep -v '^#' | sed '/^$/d' | sort -u > "$allowed"
sed -n '/failing tests:/,$p' "$log" | grep '^✖' | grep -v 'failing tests' | sed -E 's/^✖ //; s/ \([0-9.]+ms\)$//' | sort -u > "$actual"
grep -E '^ℹ (tests|pass|fail|skipped)' "$log"
new=$(comm -23 "$actual" "$allowed")
fixed=$(comm -13 "$actual" "$allowed" | grep -v -F -f "$dir/flaky.txt" || true)
[ -n "$fixed" ] && { echo "基线中已不再失败（可以从基线移除）:"; echo "$fixed"; }
if [ -n "$new" ]; then echo "新增失败:"; echo "$new"; rm -f "$allowed" "$actual"; exit 1; fi
echo "OK：失败集合在基线范围内"; rm -f "$allowed" "$actual"
