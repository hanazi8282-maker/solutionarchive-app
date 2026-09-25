#!/usr/bin/env bash
# main 보호를 클래식 브랜치 보호 → 룰셋(Rulesets)으로 옮긴다 — 남헌이 한 번 실행한다 (2026-09-25 옵션 B 확정).
#
# 왜 (3줄)
#   1) 클래식 보호는 필수 체크에 "예외 주체"를 못 둔다. 그래서 무인 루프(daily-cmo-loop·transferability-digest)가
#      GITHUB_TOKEN 으로 main 에 바로 push 하는 커밋이 매일 GH006 으로 거부된다(2026-09-24 부터).
#   2) 룰셋은 bypass actor 를 둘 수 있다. **전용 GitHub App(남헌 소유, 2026-09-25 B안 확정)** 만 예외로 두고, 사람의 push·PR 에는
#      필수 체크(build + Vercel, strict)를 그대로 건다.
#   3) 순서가 생명이다: 룰셋이 **실제로 생긴 것을 확인한 뒤에만** 클래식 보호를 지운다. 먼저 지우면 main 이 무방비다.
#
# 사용:
#   bash scripts/setup-ruleset.sh --dry-run   # 보낼 내용만 출력, 아무것도 안 바꾼다
#   bash scripts/setup-ruleset.sh             # 백업 → 룰셋 생성 → 확인 → 클래식 삭제 → 테스트 실행
#
# 되돌리기:
#   gh api -X DELETE repos/$REPO/rulesets/<id>               # 룰셋 제거
#   bash scripts/setup-branch-protection.sh                  # 클래식 보호 복구(PR #263 스크립트)
#   (0 단계 백업 파일 ops/state/branch-protection-backup-<UTC>.json 에 원본 JSON 이 있다)
#
# ⚠️ 2026-09-25 실측: 기본 GitHub Actions 앱(15368)은 "리포/조직 소유가 아니라" bypass actor 가 될 수 없다.
#    그래서 남헌이 만든 전용 GitHub App 의 ID 를 env BYPASS_APP_ID 로 받는다(하드코딩 없음). 워크플로는
#    actions/create-github-app-token 으로 그 앱의 설치 토큰을 받아 push 한다(daily-cmo-loop.yml·transferability-digest.yml).
#    사용: BYPASS_APP_ID=<새 App ID> bash scripts/setup-ruleset.sh
#    1 단계가 실패하면 여기서 멈추고 대안을 출력한다 — 클래식 보호는 그대로 남아 있으므로 실패해도 아무것도 나빠지지 않는다.
set -euo pipefail

REPO="${REPO:-hanazi8282-maker/solutionarchive-app}"
BRANCH="${BRANCH:-main}"
RULESET_NAME="${RULESET_NAME:-main-protection}"
ACTIONS_APP_ID=15368   # GitHub Actions 앱 — 필수 체크 `build` 의 integration_id 로만 쓴다(bypass 주체로는 불가, 09-25 실측).
BYPASS_APP_ID="${BYPASS_APP_ID:-}"   # 무인 push 용 전용 GitHub App 의 App ID(숫자). 남헌이 앱을 만든 뒤 알려 준 값.
VERCEL_APP_ID=8329     # Vercel 앱. 필수 체크 `Vercel` 의 app_id.
TEST_WORKFLOW="${TEST_WORKFLOW:-transferability-digest.yml}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

if [ -z "$BYPASS_APP_ID" ] || ! [[ "$BYPASS_APP_ID" =~ ^[0-9]+$ ]]; then
  echo "❌ BYPASS_APP_ID 가 없거나 숫자가 아니다. 전용 GitHub App 의 App ID 를 넣어라:"
  echo "   BYPASS_APP_ID=<App ID> bash scripts/setup-ruleset.sh [--dry-run]"
  echo "   (App ID 는 github.com/settings/apps/<앱> 상단. 리포 시크릿 BOT_APP_ID 와 같은 값.)"
  exit 2
fi

ruleset=$(cat <<JSON
{
  "name": "$RULESET_NAME",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/$BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": $BYPASS_APP_ID, "actor_type": "Integration", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "build",  "integration_id": $ACTIONS_APP_ID },
          { "context": "Vercel", "integration_id": $VERCEL_APP_ID }
        ]
      }
    }
  ]
}
JSON
)

echo "리포: $REPO · 브랜치: $BRANCH · 룰셋: $RULESET_NAME · bypass App ID: $BYPASS_APP_ID"
echo "── 보낼 룰셋 JSON ──"
echo "$ruleset"
echo

if [ "$DRY_RUN" = "1" ]; then
  echo "(dry-run) 아무것도 바꾸지 않았다. 실제 적용: bash scripts/setup-ruleset.sh"
  exit 0
fi

# ── 0) 클래식 보호 백업 ─────────────────────────────────────────────
mkdir -p ops/state
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="ops/state/branch-protection-backup-$stamp.json"
if gh api "repos/$REPO/branches/$BRANCH/protection" > "$backup" 2>/dev/null; then
  echo "0) 클래식 보호 백업: $backup ($(wc -c < "$backup") bytes)"
  had_classic=1
else
  echo "0) 클래식 보호가 없다(404) — 백업 없이 진행. 삭제 단계는 건너뛴다."
  rm -f "$backup"
  had_classic=0
fi

# 같은 이름의 룰셋이 이미 있으면 다시 만들지 않는다(멱등).
existing=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$RULESET_NAME\") | .id" 2>/dev/null || true)
if [ -n "$existing" ]; then
  echo "1) 룰셋 '$RULESET_NAME' 이 이미 있다 (id $existing) — 생성을 건너뛴다."
  ruleset_id="$existing"
else
  # ── 1) 룰셋 생성 시도 ─────────────────────────────────────────────
  echo "1) 룰셋 생성 시도…"
  set +e
  resp=$(printf '%s' "$ruleset" | gh api -X POST "repos/$REPO/rulesets" --input - 2>&1)
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "❌ 룰셋 생성 실패 (gh exit $rc). 응답:"
    echo "$resp"
    echo
    echo "클래식 보호는 그대로다 — 아무것도 나빠지지 않았다."
    echo "가장 흔한 원인: 앱(id $BYPASS_APP_ID)이 이 리포에 설치돼 있지 않거나, App ID 가 아니라 Client ID/설치 ID 를 넣은 경우."
    echo "확인할 것: (1) github.com/settings/apps/<앱> → Install App → 이 리포에 설치됐는가"
    echo "           (2) 앱 권한 Contents: Read and write 인가  (3) 넣은 값이 App ID(숫자) 인가"
    echo "그래도 안 되면 대안 A) 관리자 fine-grained PAT 를 시크릿으로 두고 워크플로 토큰을 그걸로 교체(되돌리기 쉬움)."
    exit 1
  fi
  ruleset_id=$(printf '%s' "$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).id||""))}catch{}})')
  if [ -z "$ruleset_id" ]; then
    echo "❌ 생성 응답에 id 가 없다 — 확인 불가. 응답:"; echo "$resp"; exit 1
  fi
  echo "   생성됨: ruleset id $ruleset_id"
fi

# ── 1b) 룰셋이 실제로 살아 있는지 재조회 (응답만 믿지 않는다 — §7.1) ──────
check=$(gh api "repos/$REPO/rulesets/$ruleset_id")
enf=$(printf '%s' "$check" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const ba=(r.bypass_actors||[]).map(a=>a.actor_type+":"+a.actor_id).join(",");const rules=(r.rules||[]).map(x=>x.type).join(",");process.stdout.write(`${r.enforcement}|${ba}|${rules}`)})')
echo "   재조회: enforcement|bypass|rules = $enf"
case "$enf" in
  active\|*Integration:$BYPASS_APP_ID*\|*required_status_checks*) echo "   ✅ 활성 · bypass=App $BYPASS_APP_ID · 필수 체크 포함";;
  *) echo "❌ 룰셋이 기대와 다르다(비활성이거나 bypass/필수 체크 누락). 클래식 보호를 지우지 않는다."; exit 1;;
esac

# ── 2) 룰셋 확인된 뒤에만 클래식 보호 삭제 ──────────────────────────────
if [ "$had_classic" = "1" ]; then
  echo "2) 클래식 보호 삭제…"
  gh api -X DELETE "repos/$REPO/branches/$BRANCH/protection"
  if gh api "repos/$REPO/branches/$BRANCH/protection" >/dev/null 2>&1; then
    echo "❌ 삭제 뒤에도 클래식 보호가 조회된다 — 확인 불가. 수동 확인 필요."; exit 1
  fi
  echo "   ✅ 클래식 보호 삭제 확인(404)"
else
  echo "2) 클래식 보호가 없었으므로 건너뜀"
fi

# ── 3) 무인 push 테스트 — transferability-digest 수동 실행 ──────────────
echo "3) $TEST_WORKFLOW 수동 실행 → push 성공 여부는 Actions 탭에서 본다"
gh workflow run "$TEST_WORKFLOW"
sleep 5
gh run list --workflow "$TEST_WORKFLOW" -L 1 --json databaseId,status,url --jq '.[] | "   run \(.databaseId) \(.status) \(.url)"'
echo
echo "끝. 결과 판정: 위 run 의 마지막 스텝이 'git push' 를 통과하면 성공."
echo "  실패(GH006 그대로)면 bypass 가 안 먹은 것 — 룰셋을 지우고(gh api -X DELETE repos/$REPO/rulesets/$ruleset_id)"
echo "  bash scripts/setup-branch-protection.sh 로 클래식 보호를 복구한 뒤 대안 A/B 로 간다."
