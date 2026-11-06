#!/bin/bash
# npm test 门禁。用法（仓库根目录）：docs/p4/baseline/test-gate.sh [日志目录]
# 规则：
#   1. 跑一次 npm test；tests 总数必须 >= MIN_TESTS（默认 1452，可用环境变量覆盖，T2 删除测试后按 STATUS.md 记录调整）。
#   2. 失败集合减去允许集合（inherited ∪ flaky ∪ expected-identity）为空 → 通过。
#   3. 否则最多再跑 2 次；只有在每一次运行中都失败的测试才算"新增失败"。
#      该套件有大量 3s/8s 墙钟截止断言，负载下会随机超时，单次运行的失败不能作为回归证据。
set -u
dir=$(cd "$(dirname "$0")" && pwd)
logdir=${1:-$(mktemp -d -t pira-gate)}
min=${MIN_TESTS:-554}
mkdir -p "$logdir"
allowed="$logdir/allowed.txt"
cat "$dir"/inherited-failures.txt "$dir"/flaky.txt "$dir"/expected-identity.txt | grep -v '^#' | sed '/^$/d' | sort -u > "$allowed"
failures() { sed -n '/failing tests:/,$p' "$1" | grep '^✖' | grep -v 'failing tests' | sed -E 's/^✖ //; s/ \([0-9.]+ms\)$//' | sort -u; }
persistent=""
for run in 1 2 3; do
  log="$logdir/run$run.log"
  npm test > "${log}" 2>&1
  total=$(grep -E '^ℹ tests ' "${log}" | awk '{print $3}')
  echo "run $run: $(grep -E '^ℹ (tests|pass|fail|skipped) ' "${log}" | tr '\n' ' ')"
  if [ -z "$total" ] || [ "$total" -lt "$min" ]; then echo "失败：测试总数 ${total:-0} < ${min}（有测试文件没有加载？）日志：${log}"; exit 1; fi
  new=$(comm -23 <(failures "${log}") "$allowed")
  if [ "$run" = 1 ]; then persistent=$new; else persistent=$(comm -12 <(printf '%s\n' "$persistent" | sed '/^$/d') <(printf '%s\n' "$new" | sed '/^$/d')); fi
  if [ -z "$persistent" ]; then echo "OK：没有持续性新增失败（日志目录 ${logdir}）"; exit 0; fi
  echo "  超出基线的失败（暂定）：$(printf '%s' "$persistent" | tr '\n' ';')"
done
echo "失败：以下测试在 3 次运行中都失败，视为回归："; printf '%s\n' "$persistent"; exit 1
