#!/usr/bin/env bash
# methodology/content 의 02/03/04 를 solfa-gate 스킬의 references/ 로 복사한다.
# 정본은 methodology/content 이고 references/ 는 항상 그 복사본이다. 반대 방향으로 쓰지 마라.
#   사용: bash scripts/sync-solfa-skill.sh [--check]
#   --check  복사하지 않고 차이만 보고한다 (CI 용, 차이가 있으면 종료코드 1)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/methodology/content"
DST="$ROOT/.claude/skills/solfa-gate/references"
FILES=(02-gate.md 03-excerpts.md 04-decisions.md)

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

[ -d "$SRC" ] || { echo "정본 디렉터리가 없다: $SRC" >&2; exit 1; }
mkdir -p "$DST"

drift=0
for f in "${FILES[@]}"; do
  if [ ! -f "$SRC/$f" ]; then
    echo "MISSING  $SRC/$f" >&2
    drift=1
    continue
  fi
  if cmp -s "$SRC/$f" "$DST/$f"; then
    echo "SAME     $f"
    continue
  fi
  drift=1
  if [ "$CHECK" -eq 1 ]; then
    echo "DRIFT    $f"
  else
    cp -p "$SRC/$f" "$DST/$f"
    echo "COPIED   $f"
  fi
done

if [ "$CHECK" -eq 1 ] && [ "$drift" -ne 0 ]; then
  echo "스킬 references 가 정본과 어긋나 있다. bash scripts/sync-solfa-skill.sh 를 실행하라." >&2
  exit 1
fi
echo "완료."
