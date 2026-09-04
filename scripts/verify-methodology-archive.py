# -*- coding: utf-8 -*-
"""methodology/content 아카이브 무결성 검증 (솔파 + 프드프 + 교차).

자료가 둘이 되면서 레이아웃이 `content/<자료>/01~05` + 상위 3파일로 바뀌었다.
verify-solfa-archive.py 는 평면 레이아웃 전용이라 이 스크립트가 그것을 대체한다.

검사 항목
  1. 대상 파일이 전부 UTF-8 로 정상 디코딩되는가
  2. <자료>/01-methodology.md 의 `### n-m.` 소분류 헤딩이 기대 개수인가
  3. 소분류 헤딩 중 출처 마커 `[...]` 가 없는 것이 §0 의 0-1/0-2/0-3 뿐인가
  4. `§n-m` 상호참조가 자기 자료의 01 헤딩에 존재하는가
     — 없는 번호라도 같은 줄 앞쪽에 "솔파"가 있으면 타 자료 참조로 보고 통과
  5. P-01~P-14 / R-01~R-14 참조가 각 04-decisions.md 에 정의되어 있는가
  6. C-01~C-12 참조가 cross-decisions.md 에 정의되어 있는가

사용: py scripts/verify-methodology-archive.py
종료코드 0 = 통과, 1 = 실패
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "methodology" / "content"

ROOT_FILES = ["00-gate.md", "cross-decisions.md", "eval-set.md"]
CORPUS_FILES = [
    "README.md",
    "01-methodology.md",
    "02-gate.md",
    "03-excerpts.md",
    "04-decisions.md",
    "05-provenance.md",
]

# provenance=False 인 자료는 05-provenance.md 가 아예 없다.
# 솔파는 원문 대조 인덱스가 작성된 적이 없다 (README/01 은 05 를 참조하지만 문서는 부재).
CORPORA = {
    "pdp": {"headings": 95, "rule": "P", "rule_max": 14, "provenance": True},
    "solfa": {"headings": 119, "rule": "R", "rule_max": 14, "provenance": False},
}
CROSS_MAX = 12
SOURCE_MARKER_EXEMPT = {"0-1", "0-2", "0-3"}

HEADING_RE = re.compile(r"^###\s+(\d+-\d+)\.\s*(.*)$", re.MULTILINE)
XREF_RE = re.compile(r"§(\d+-\d+)")
MARKER_RE = re.compile(r"`\[[^\]]+\]`")

failures = []
notes = []


def fail(msg):
    failures.append(msg)


def read(path):
    """UTF-8 로 읽는다. 실패하면 None 을 돌려주고 실패로 기록한다."""
    rel = path.relative_to(BASE)
    if not path.exists():
        print(f"    MISSING  {rel}")
        fail(f"{rel} 누락")
        return None
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        print(f"    FAIL     {rel}: {exc}")
        fail(f"{rel} UTF-8 디코딩 실패")
        return None
    if raw.startswith(b"\xef\xbb\xbf"):
        notes.append(f"{rel} 에 UTF-8 BOM 이 있다")
    print(f"    OK       {rel}  {len(raw):,} bytes")
    return text


def corpus_dir(name):
    """<자료>/ 서브디렉터리. 아직 이관 전이면 평면 레이아웃으로 되돌아간다."""
    sub = BASE / name
    if (sub / "01-methodology.md").exists():
        return sub
    if name == "solfa" and (BASE / "01-methodology.md").exists():
        notes.append("solfa 가 아직 평면 레이아웃이다 (content/01~04). solfa/ 로 이관 필요")
        return BASE
    return sub


def check_headings(name, text, expected):
    ids = [m.group(1) for m in HEADING_RE.finditer(text)]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    print(f"    {name}/01: 소분류 헤딩 {len(ids)} 개 (기대 {expected})")
    if dupes:
        print(f"    중복 헤딩: {', '.join(dupes)}")
        fail(f"{name}/01 소분류 헤딩 중복: {dupes}")
    if len(ids) != expected:
        fail(f"{name}/01 소분류 헤딩 {len(ids)} 개 (기대 {expected})")
    return set(ids)


def check_markers(name, text):
    missing = [m.group(1) for m in HEADING_RE.finditer(text) if not MARKER_RE.search(m.group(2))]
    shown = ", ".join("§" + m for m in missing) or "(없음)"
    print(f"    {name}/01: 마커 없는 헤딩 {len(missing)} 개 -> {shown}")
    unexpected = [m for m in missing if m not in SOURCE_MARKER_EXEMPT]
    if unexpected:
        fail(f"{name}/01 출처 마커 없는 예상 밖 헤딩: {unexpected}")
    absent = sorted(SOURCE_MARKER_EXEMPT - set(missing))
    if absent:
        notes.append(f"{name}/01 면제 대상인데 마커가 붙어 있다: {absent}")


def check_xrefs(name, texts, heading_ids):
    """자기 01 에 없는 §n-m 은, 같은 줄 앞쪽에 '솔파'가 있으면 타 자료 참조로 본다."""
    total = 0
    bad_total = 0
    for rel, text in texts.items():
        refs = 0
        bad = []
        for line in text.splitlines():
            for m in XREF_RE.finditer(line):
                refs += 1
                if m.group(1) in heading_ids:
                    continue
                if "솔파" in line[: m.start()]:
                    continue
                bad.append(f"§{m.group(1)}  ← {line.strip()[:80]}")
        total += refs
        bad_total += len(bad)
        print(f"    {rel}: 참조 {refs} 개, 댕글링 {len(bad)} 개")
        for b in bad:
            print(f"      DANGLING {b}")
    if bad_total:
        fail(f"{name} 댕글링 상호참조 {bad_total} 건")
    print(f"    {name} 합계 참조 {total} 개")


def check_rule_refs(label, prefix, maximum, texts, decisions_text, decisions_rel):
    """P-xx / R-xx / C-xx 참조가 정의 문서에 실제로 정의되어 있는가."""
    ref_re = re.compile(rf"\b{prefix}-(\d{{2}})\b")
    def_re = re.compile(rf"^#{{1,6}}.*\b{prefix}-(\d{{2}})\b|^\|\s*\*?\*?{prefix}-(\d{{2}})\b", re.MULTILINE)
    defined = {g for m in def_re.finditer(decisions_text) for g in m.groups() if g}
    used = set()
    for text in texts.values():
        used |= {m.group(1) for m in ref_re.finditer(text)}
    in_range = {u for u in used if 1 <= int(u) <= maximum}
    missing = sorted(u for u in in_range if u not in defined)
    beyond = sorted(u for u in used if int(u) > maximum)
    print(f"    {label}: 참조 {len(used)} 종, {decisions_rel} 정의 {len(defined)} 종")
    if missing:
        print(f"    미정의: {', '.join(prefix + '-' + m for m in missing)}")
        fail(f"{label} 미정의 참조: {missing}")
    if beyond:
        notes.append(f"{label} 범위 밖 참조 (승격 예정 등): {', '.join(prefix + '-' + b for b in beyond)}")


def main():
    print(f"대상: {BASE}\n")

    print("[1] UTF-8 디코딩 — 상위 3파일")
    root_texts = {}
    for name in ROOT_FILES:
        text = read(BASE / name)
        if text is not None:
            root_texts[name] = text

    corpus_texts = {}
    for name in CORPORA:
        print(f"\n[1] UTF-8 디코딩 — {name}/")
        d = corpus_dir(name)
        texts = {}
        wanted = [f for f in CORPUS_FILES
                  if f != "05-provenance.md" or CORPORA[name]["provenance"]]
        if not CORPORA[name]["provenance"]:
            notes.append(f"{name}/05-provenance.md 는 미작성이다 (검사 대상에서 제외)")
        for f in wanted:
            text = read(d / f)
            if text is not None:
                texts[str((d / f).relative_to(BASE))] = text
        corpus_texts[name] = (d, texts)

    for name, spec in CORPORA.items():
        d, texts = corpus_texts[name]
        main_key = str((d / "01-methodology.md").relative_to(BASE))
        print(f"\n[2][3][4] {name}")
        if main_key not in texts:
            print(f"    01-methodology.md 를 읽을 수 없어 건너뛴다.")
            continue
        ids = check_headings(name, texts[main_key], spec["headings"])
        check_markers(name, texts[main_key])
        check_xrefs(name, texts, ids)

    print("\n[5] 규칙 참조 정의 대조")
    for name, spec in CORPORA.items():
        d, texts = corpus_texts[name]
        dec_key = str((d / "04-decisions.md").relative_to(BASE))
        if dec_key not in texts:
            fail(f"{name}/04-decisions.md 를 읽을 수 없어 규칙 대조 불가")
            continue
        check_rule_refs(
            f"{name} {spec['rule']}-01~{spec['rule']}-{spec['rule_max']:02d}",
            spec["rule"],
            spec["rule_max"],
            {**texts, **root_texts},
            texts[dec_key],
            dec_key,
        )

    print("\n[6] 교차 판정 참조 정의 대조")
    if "cross-decisions.md" not in root_texts:
        fail("cross-decisions.md 를 읽을 수 없어 C-xx 대조 불가")
    else:
        all_texts = dict(root_texts)
        for _, texts in corpus_texts.values():
            all_texts.update(texts)
        check_rule_refs(
            f"C-01~C-{CROSS_MAX:02d}",
            "C",
            CROSS_MAX,
            all_texts,
            root_texts["cross-decisions.md"],
            "cross-decisions.md",
        )

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
