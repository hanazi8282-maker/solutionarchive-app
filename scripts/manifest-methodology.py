# -*- coding: utf-8 -*-
"""methodology/content 의 MANIFEST 생성·대조 (INF-01).

왜 만드는가 — infra-decisions.md INF-01 은 제안이 두 번 반복됐고 그 사이에
사고가 두 건 났다.

  2026-09-03 제안: --check-project-sync (SHA 비교)
  2026-09-04 제안: MANIFEST.txt (md5)
  사고 ①: solfa/ 자리에 pdp 사본이 들어갔다
  사고 ②: 02-gate.md 구버전이 커밋됐다

md5 만으로는 부족하다. 정본은 append-only 라 판정 로그가 붙을 때마다 md5 가
바뀌는 게 정상이고, 그때마다 훅이 막으면 사람이 훅을 끈다. 그래서 md5 옆에
**구조 카운트**를 같이 적는다. 정상적인 append 는 카운트를 늘리거나 유지하지만,
사본 사고와 구버전 되돌림은 카운트를 **줄인다**. 줄어드는 것만 막으면 된다.

  사본 사고    — solfa 와 pdp 의 md5 가 같으면 즉시 실패
  구버전 커밋  — 구조 카운트가 매니페스트보다 줄면 실패
  누락        — 매니페스트에 있는 파일이 없으면 실패

사용:
  py scripts/manifest-methodology.py --write   MANIFEST.txt 갱신
  py scripts/manifest-methodology.py --check   대조만 (종료코드 1 = 실패)

종료코드 0 = 통과, 1 = 실패
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "methodology" / "content"
MANIFEST = BASE / "MANIFEST.txt"

# 결과 리포트는 실행마다 새로 생기는 산출물이라 정본 무결성 대상이 아니다.
SKIP_DIRS = {"eval/results"}

HEADER = """# methodology/content 무결성 매니페스트 (INF-01)
#
# 생성: py scripts/manifest-methodology.py --write
# 대조: py scripts/manifest-methodology.py --check   (pre-commit 훅이 자동 실행)
#
# 형식: <경로>  <md5>  <구조 카운트...>
#
# 구조 카운트 정의
#   subs    `### n-m.` 소분류 헤딩 수
#   marks   그중 출처 마커 `[...]` 가 붙은 것 (verify 검사 3 과 같은 정의)
#   gates   `G-n` 게이트 코드 종류 수 / GR   `G-R` 역방향 질문표 유무
#   rules   `R-nn`·`P-nn` 규칙 코드 종류 수 / logs  판정 로그 엔트리 수
#   cross   `C-nn` 교차 코드 종류 수 / qs  `### Qn` 문항 수
#   lines   줄 수 (그 외 파일)
#
# ⚠️ md5 가 바뀌는 것 자체는 정상이다 (04-decisions.md 는 append-only).
#    훅이 막는 것은 **구조 카운트가 줄어드는 것** 과 **solfa/pdp md5 동일** 이다.
#    카운트가 줄었다면 구버전을 덮어썼거나 사본을 잘못 넣은 것이다.
"""


def md5(path: Path) -> str:
    # 줄바꿈을 LF 로 정규화한 뒤 해싱한다. 이 리포는 core.autocrlf=true 라
    # 윈도우에서 체크아웃하면 .md 가 CRLF 로 풀린다. 파일 그대로의 md5 를 쓰면
    # 내용이 같은데도 OS 마다 값이 달라져서 매니페스트가 매번 실패한다.
    raw = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.md5(raw).hexdigest()


def counts(rel: str, text: str) -> dict:
    name = rel.rsplit("/", 1)[-1]
    out = {}
    if name == "01-methodology.md":
        subs = re.findall(r"^### (\d+-\d+)\.(.*)$", text, re.MULTILINE)
        out["subs"] = len(subs)
        out["marks"] = sum(1 for _, tail in subs if "[" in tail)
    elif name == "02-gate.md" or name == "00-gate.md":
        out["gates"] = len(set(re.findall(r"\bG-\d+\b", text)))
        out["GR"] = "yes" if "G-R" in text else "no"
    elif name == "04-decisions.md":
        out["rules"] = len(set(re.findall(r"\b[RP]-\d{2}\b", text)))
        out["logs"] = len(re.findall(r"^\s*[-*]?\s*\**\s*코드\s*\**\s*[:：]", text, re.MULTILINE))
    elif name == "cross-decisions.md":
        out["cross"] = len(set(re.findall(r"\bC-\d{2}\b", text)))
    elif name == "questions.md":
        out["qs"] = len(re.findall(r"^### Q\d+", text, re.MULTILINE))
    elif name == "answers.md":
        out["as"] = len(re.findall(r"^\*\*A\d+", text, re.MULTILINE))
    else:
        out["lines"] = text.count("\n") + 1
    return out


def scan() -> list:
    rows = []
    for p in sorted(BASE.rglob("*.md")):
        rel = p.relative_to(BASE).as_posix()
        if any(rel.startswith(d + "/") for d in SKIP_DIRS):
            continue
        text = p.read_text(encoding="utf-8")
        rows.append((rel, md5(p), counts(rel, text)))
    return rows


def render(rows: list) -> str:
    width = max(len(r) for r, _, _ in rows) + 2
    lines = [HEADER]
    for rel, digest, cnt in rows:
        tail = "  ".join(f"{k}:{v}" for k, v in cnt.items())
        lines.append(f"{rel.ljust(width)}{digest}  {tail}")
    return "\n".join(lines) + "\n"


def parse(text: str) -> dict:
    out = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        rel, digest, rest = parts[0], parts[1], parts[2:]
        cnt = {}
        for token in rest:
            k, _, v = token.partition(":")
            cnt[k] = v
        out[rel] = (digest, cnt)
    return out


def check() -> int:
    if not MANIFEST.exists():
        print(f"✗ {MANIFEST.relative_to(ROOT)} 가 없다. --write 로 먼저 만들어라.")
        return 1

    recorded = parse(MANIFEST.read_text(encoding="utf-8"))
    current = {rel: (digest, cnt) for rel, digest, cnt in scan()}
    failures = []
    notes = []

    # ── 누락 ──
    for rel in recorded:
        if rel not in current:
            failures.append(f"매니페스트에 있는 파일이 없다: {rel}")

    # ── 사본 사고 ── 같은 이름의 solfa/pdp 파일이 바이트까지 같으면 한쪽이 사본이다
    for rel, (digest, _) in current.items():
        if not rel.startswith("solfa/"):
            continue
        twin = "pdp/" + rel.split("/", 1)[1]
        if twin in current and current[twin][0] == digest:
            failures.append(f"solfa 와 pdp 의 내용이 동일하다 (사본 사고): {rel} == {twin}")

    # ── 구버전 되돌림 ── append-only 아카이브에서 구조 카운트는 줄지 않는다
    for rel, (digest, cnt) in current.items():
        if rel not in recorded:
            notes.append(f"매니페스트에 없는 새 파일: {rel}")
            continue
        old_digest, old_cnt = recorded[rel]
        for key, old in old_cnt.items():
            if not old.isdigit():
                continue
            new = str(cnt.get(key, ""))
            if new.isdigit() and int(new) < int(old):
                failures.append(
                    f"{rel} 의 {key} 가 {old} → {new} 로 줄었다. "
                    "구버전을 덮어썼거나 사본을 잘못 넣은 것이다."
                )
        if old_digest != digest and not failures:
            notes.append(f"내용 변경: {rel}")

    for n in notes:
        print(f"  · {n}")
    if failures:
        for f in failures:
            print(f"✗ {f}")
        return 1
    print(f"✓ MANIFEST 대조 통과 ({len(current)} 파일)")
    return 0


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    if mode == "--write":
        rows = scan()
        MANIFEST.write_text(render(rows), encoding="utf-8")
        print(f"✓ {MANIFEST.relative_to(ROOT)} 갱신 ({len(rows)} 파일)")
        return 0
    if mode == "--check":
        return check()
    print(f"알 수 없는 옵션: {mode}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
