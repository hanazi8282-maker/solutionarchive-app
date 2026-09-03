# -*- coding: utf-8 -*-
"""methodology/content 아카이브 무결성 검증.

검사 항목
  1. 모든 파일이 UTF-8 로 정상 디코딩되는가
  2. 01-methodology.md 의 `### n-m.` 소분류 헤딩이 119 개인가
  3. 모든 파일의 `§n-m` 상호참조가 01 의 실제 헤딩에 존재하는가 (댕글링 0)
  4. 01 의 소분류 헤딩 중 출처 마커 `[연도:...]` 가 없는 것 (§0 의 0-1/0-2/0-3 만 정상)

사용: py scripts/verify-solfa-archive.py
종료코드 0 = 통과, 1 = 실패
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "methodology" / "content"

EXPECTED_FILES = [
    "README.md",
    "01-methodology.md",
    "02-gate.md",
    "03-excerpts.md",
    "04-decisions.md",
    "05-provenance.md",
]
EXPECTED_HEADING_COUNT = 119
SOURCE_MARKER_EXEMPT = {"0-1", "0-2", "0-3"}

HEADING_RE = re.compile(r"^###\s+(\d+-\d+)\.\s*(.*)$", re.MULTILINE)
XREF_RE = re.compile(r"§(\d+-\d+)")
MARKER_RE = re.compile(r"`\[[^\]]+\]`")

failures = []
notes = []


def fail(msg):
    failures.append(msg)


def check_files():
    print("[1] UTF-8 디코딩")
    texts = {}
    for name in EXPECTED_FILES:
        path = BASE / name
        if not path.exists():
            print(f"    MISSING  {name}")
            fail(f"{name} 누락")
            continue
        raw = path.read_bytes()
        try:
            texts[name] = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            print(f"    FAIL     {name}: {exc}")
            fail(f"{name} UTF-8 디코딩 실패")
            continue
        bom = " (BOM 있음)" if raw.startswith(b"\xef\xbb\xbf") else ""
        if bom:
            notes.append(f"{name} 에 UTF-8 BOM 이 있다")
        print(f"    OK       {name}  {len(raw):,} bytes{bom}")
    return texts


def check_headings(text):
    print("\n[2] 01-methodology.md 소분류 헤딩 수")
    ids = [m.group(1) for m in HEADING_RE.finditer(text)]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    print(f"    발견: {len(ids)} 개 (기대 {EXPECTED_HEADING_COUNT})")
    if dupes:
        print(f"    중복 헤딩: {', '.join(dupes)}")
        fail(f"01 소분류 헤딩 중복: {dupes}")
    if len(ids) != EXPECTED_HEADING_COUNT:
        fail(f"01 소분류 헤딩 {len(ids)} 개 (기대 {EXPECTED_HEADING_COUNT})")
    return set(ids)


def check_xrefs(texts, heading_ids):
    print("\n[3] §n-m 상호참조 → 01 실제 헤딩 대조")
    total = 0
    dangling = {}
    for name, text in texts.items():
        refs = XREF_RE.findall(text)
        total += len(refs)
        bad = sorted({r for r in refs if r not in heading_ids})
        if bad:
            dangling[name] = bad
        print(f"    {name}: 참조 {len(refs)} 개, 댕글링 {len(bad)} 개")
    if dangling:
        for name, bad in dangling.items():
            print(f"    DANGLING {name}: {', '.join('§' + b for b in bad)}")
        fail(f"댕글링 상호참조 {sum(len(v) for v in dangling.values())} 건")
    print(f"    합계 참조 {total} 개")


def check_markers(text):
    print("\n[4] 소분류 헤딩의 출처 마커")
    missing = [m.group(1) for m in HEADING_RE.finditer(text) if not MARKER_RE.search(m.group(2))]
    print(f"    마커 없는 헤딩: {len(missing)} 개 -> {', '.join('§' + m for m in missing) or '(없음)'}")
    unexpected = [m for m in missing if m not in SOURCE_MARKER_EXEMPT]
    if unexpected:
        fail(f"출처 마커 없는 예상 밖 헤딩: {unexpected}")
    absent_exempt = sorted(SOURCE_MARKER_EXEMPT - set(missing))
    if absent_exempt:
        notes.append(f"면제 대상인데 마커가 붙어 있는 헤딩: {absent_exempt}")


def main():
    print(f"대상: {BASE}\n")
    texts = check_files()
    main_doc = texts.get("01-methodology.md")
    if main_doc is None:
        print("\n01-methodology.md 를 읽을 수 없어 2~4 를 건너뛴다.")
    else:
        heading_ids = check_headings(main_doc)
        check_xrefs(texts, heading_ids)
        check_markers(main_doc)

    print("\n" + "=" * 50)
    for note in notes:
        print(f"NOTE: {note}")
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print(f"\n결과: 실패 {len(failures)} 건")
        return 1
    print("결과: 전 항목 통과")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
