#!/usr/bin/env bash
# main 브랜치 보호 + 리포 auto-merge 설정 — 남헌이 한 번 실행한다 (2026-09-24 8차 결정 2번).
#
# 무엇을 바꾸나 (3줄)
#   1) 리포 설정 "Allow auto-merge" 를 켠다. 켜야 `gh pr merge --auto` 가 "체크 통과 시 자동 머지"로 대기한다.
#   2) main 브랜치 보호: 필수 체크 = GitHub Actions `build`(build-check.yml) + Vercel preview `Vercel`.
#      strict=true 라 머지 전에 브랜치가 main 최신이어야 한다 (파일이 안 겹쳐도 CI 를 다시 돈다).
#   3) 리뷰 필수는 걸지 않는다 (사람이 한 명). 관리자(남헌)는 기본으로 규칙에서 제외된다 —
#      급할 때 손으로 머지할 수 있는 탈출구다. 관리자도 묶으려면 ENFORCE_ADMINS=1 로 실행.
#
# 사용:
#   bash scripts/setup-branch-protection.sh --dry-run   # 보낼 내용만 출력
#   bash scripts/setup-branch-protection.sh             # 적용 + 결과 재조회
#   ENFORCE_ADMINS=1 bash scripts/setup-branch-protection.sh
#
# 되돌리기: gh api -X DELETE repos/$REPO/branches/main/protection
#           gh api -X PATCH  repos/$REPO -F allow_auto_merge=false
set -euo pipefail

REPO="${REPO:-hanazi8282-maker/solutionarchive-app}"
BRANCH="${BRANCH:-main}"
ENFORCE_ADMINS="${ENFORCE_ADMINS:-0}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

enforce=false
[ "$ENFORCE_ADMINS" = "1" ] && enforce=true

# 필수 체크 이름은 PR #253~#262 의 statusCheckRollup 실측값이다.
#   build  = GitHub Actions 잡 id (build-check.yml)   /  Vercel = Vercel 커밋 상태 컨텍스트
protection=$(cat <<JSON
{
  "required_status_checks": { "strict": true, "checks": [ { "context": "build" }, { "context": "Vercel" } ] },
  "enforce_admins": $enforce,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
)

echo "== repo: $REPO  branch: $BRANCH  enforce_admins: $enforce"
echo "== branch protection payload:"
echo "$protection"

if [ "$DRY_RUN" = "1" ]; then
  echo "== dry-run: 아무것도 보내지 않았다."
  exit 0
fi

gh auth status >/dev/null

echo "== 1/2 allow_auto_merge=true"
gh api -X PATCH "repos/$REPO" -F allow_auto_merge=true --jq '{allow_auto_merge}'

echo "== 2/2 branch protection"
echo "$protection" | gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - \
  --jq '{strict: .required_status_checks.strict, checks: [.required_status_checks.checks[].context], enforce_admins: .enforce_admins.enabled}'

echo "== 재조회 (양성 확인)"
gh api "repos/$REPO/branches/$BRANCH/protection" \
  --jq '{strict: .required_status_checks.strict, checks: [.required_status_checks.checks[].context], enforce_admins: .enforce_admins.enabled, reviews_required: (.required_pull_request_reviews != null)}'
gh api "repos/$REPO" --jq '{allow_auto_merge, delete_branch_on_merge}'
