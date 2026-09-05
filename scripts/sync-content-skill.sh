#!/usr/bin/env bash
# methodology/content 의 게이트·발췌·판정 문서를 content-gate 스킬의 references/ 로 복사한다.
# 정본은 methodology/content 이고 references/ 는 항상 그 복사본이다. 반대 방향으로 쓰지 마라.
#
#   사용: bash scripts/sync-content-skill.sh [--check]
#   --check  복사하지 않고 차이만 보고한다 (CI 용, 차이가 있으면 종료코드 1)
#
# 01-methodology.md 와 05-provenance.md 는 의도적으로 제외한다.
# 01 은 각각 300KB 를 넘어 컨텍스트를 전부 먹는다. 필요하면 정본을 직접 연다.
#
# prediction-schema.md 는 반대로 반드시 넣는다. 스킬이 로그 엔트리에 예측을
# 적으려면 포맷을 알아야 한다. 없으면 자연어 예측이 나가고 채점이 전량 보류된다.
# ⛔ eval/answers.md 는 절대 넣지 않는다. 정답을 컨텍스트에 넣으면 평가가 죽는다.
#
# pre-commit hook 설치 (클론마다 1회):
#   git config core.hooksPath .githooks
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/methodology/content"
DST="$ROOT/.claude/skills/content-gate/references"

# "복사본 이름 = 정본 상대경로"
MAP=(
  "00-gate.md=00-gate.md"
  "cross-decisions.md=cross-decisions.md"
  "prediction-schema.md=prediction-schema.md"
  "solfa-gate.md=solfa/02-gate.md"
  "solfa-excerpts.md=solfa/03-excerpts.md"
  "solfa-decisions.md=solfa/04-decisions.md"
  "pdp-gate.md=pdp/02-gate.md"
  "pdp-excerpts.md=pdp/03-excerpts.md"
  "pdp-decisions.md=pdp/04-decisions.md"
)

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

[ -d "$SRC" ] || { echo "정본 디렉터리가 없다: $SRC" >&2; exit 1; }
mkdir -p "$DST"

# 자료가 둘이 되면서 solfa/ 에 pdp 사본이 잘못 들어간 사고가 한 번 있었다.
# 엉뚱한 원본을 복사하기 전에 막는다.
#
# 예전에는 게이트 항목 접두어(G- vs P-)로 구별했는데, 네임스페이스 규약이
# 정리되면서 양쪽 다 G- 를 쓰게 돼 그 방법이 죽었다. 지금은 제목줄에 박힌
# 자료명으로 가른다 — 프드프 게이트만 `# 02. ... — 프드프` 를 갖는다.
guard() {
  local path="$1" pattern="$2" label="$3"
  [ -f "$path" ] || return 0
  if ! grep -q "$pattern" "$path"; then
    echo "GUARD    $path 에 $label 가 없다. 원본이 뒤바뀌었을 수 있다." >&2
    return 1
  fi
}
guard_absent() {
  local path="$1" pattern="$2" label="$3"
  [ -f "$path" ] || return 0
  if grep -q "$pattern" "$path"; then
    echo "GUARD    $path 제목줄에 $label 이 있다. 원본이 뒤바뀌었을 수 있다." >&2
    return 1
  fi
}
guard        "$SRC/solfa/02-gate.md" '^## G-0\.'      "게이트 헤딩 G-0"   || exit 1
guard_absent "$SRC/solfa/02-gate.md" '^# 02\..*프드프' "프드프 제목"        || exit 1
guard        "$SRC/pdp/02-gate.md"   '^## G-0\.'      "게이트 헤딩 G-0"   || exit 1
guard        "$SRC/pdp/02-gate.md"   '^# 02\..*프드프' "프드프 제목"        || exit 1

drift=0
for entry in "${MAP[@]}"; do
  dst_name="${entry%%=*}"
  src_rel="${entry#*=}"
  src="$SRC/$src_rel"
  dst="$DST/$dst_name"

  if [ ! -f "$src" ]; then
    echo "MISSING  $src_rel" >&2
    drift=1
    continue
  fi
  if cmp -s "$src" "$dst"; then
    echo "SAME     $dst_name"
    continue
  fi
  drift=1
  if [ "$CHECK" -eq 1 ]; then
    echo "DRIFT    $dst_name  (<- $src_rel)"
  else
    cp -p "$src" "$dst"
    echo "COPIED   $dst_name  (<- $src_rel)"
  fi
done

if [ "$CHECK" -eq 1 ] && [ "$drift" -ne 0 ]; then
  echo "스킬 references 가 정본과 어긋나 있다. bash scripts/sync-content-skill.sh 를 실행하라." >&2
  exit 1
fi
echo "완료."
