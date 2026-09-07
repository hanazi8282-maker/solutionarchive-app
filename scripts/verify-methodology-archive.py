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
  7. 코드 네임스페이스 규약을 지키는가 (게이트 G- / 규칙 R-·P- 제로패딩 / 로그 3~4글자 접두어)
  8. 백틱으로 적힌 `*.md` 상대경로 참조가 실제로 존재하는가
  9. `게이트: 통과` 인 판정 로그 엔트리에 지문(Fingerprint)이 채워져 있는가
 10. 판정 로그의 `예측` 이 prediction-schema.md 포맷을 지키는가
     (필수 6필드 / metric 은 §1-1 정의 / because 는 실재하는 규칙 코드)

7·8·9 는 _setup/verify-additions.py 에 따로 있던 검사를 옮겨 온 것이다.
§n-m 댕글링 검사(4번)가 잡지 못하는 세 사고 유형을 덮는다.
10 은 그 위에 얹은 것으로, 자연어 예측이 들어와 자동 채점이 조용히
전량 보류로 빠지는 것을 막는다.

사용: py scripts/verify-methodology-archive.py
종료코드 0 = 통과, 1 = 실패
"""
import os
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
# 2026-09-05 솔파 05 가 작성되면서 두 자료 모두 True 가 됐다.
CORPORA = {
    "pdp": {"headings": 95, "rule": "P", "rule_max": 14, "provenance": True},
    "solfa": {"headings": 119, "rule": "R", "rule_max": 14, "provenance": True},
}
CROSS_MAX = 12
SOURCE_MARKER_EXEMPT = {"0-1", "0-2", "0-3"}

# ── 검사 7·8 용 설정 ──────────────────────────────────────────
# 판정 로그 코드는 전부 3~4글자 접두어다. 한 글자 접두어(D-YYYYMMDD 등)는
# 00-gate.md 의 통합 조건분기 D-1~D-5 와 충돌한다.
LOG_PREFIXES = ["LOG-", "UPD-", "NEW-", "XUP-"]

# ★ 화이트리스트를 지워서는 안 된다.
# _setup/ 은 프롬프트 원문이라 본문에 든 경로가 전부 "예시"다. 빼지 않으면
# 경로 검사에서만 오탐 19건, 로그 접두어 검사에서 1건이 더 나오고,
# 그러면 사람이 검증기 출력을 통째로 무시하게 된다.
#
# eval/results/ 는 평가 러너가 만든 산출물이다. 안에 든 백틱 경로는 우리가 쓴
# 참조가 아니라 **모델 응답을 그대로 옮긴 인용**이라, 검사 8 이 그걸 실제 파일로
# 알고 찾다가 깨진 참조로 잡는다. 실제로 그렇게 났다 (`pdp-excerpts.md` 등 2건).
# 인용을 고쳐서 통과시키면 증거가 훼손되고, 놔두면 오탐이 매 실행마다 늘어난다.
# 정본 무결성 대상이 아니므로 뺀다 — manifest-methodology.py 도 같은 이유로 뺀다.
SKIP_DIRS = ("_setup", "eval/results")
SKIP_FILES = {
    "insight-guide.md",  # 아카이브 밖 문서
    "SKILL.md",          # .claude/skills 쪽 문서
}

PATH_REF_RE = re.compile(r"`((?:\.\./)*[\w./-]+\.md)`")
UNPADDED_RULE_RE = re.compile(r"\b[RP]-\d\b(?!\d)")
GATE_HEAD_RE = re.compile(r"^## ([A-Z]+)-", re.MULTILINE)
SHORT_LOG_RE = re.compile(r"\b[A-Z]-YYYYMMDD")

# 04-decisions / cross-decisions 안의 "정의" 형태 (참조와 구별한다)
CODE_DEFS = [
    ("R", "solfa/04-decisions.md", r"^### (R-\d{2})\."),
    ("P", "pdp/04-decisions.md", r"^### (P-\d{2})\."),
    ("C", "cross-decisions.md", r"^## \d+\. (C-\d{2})\."),
]
# 아직 정의되지 않았지만 "승격 예정"으로 본문에 언급되는 것
CODE_DEF_EXEMPT = {"R-15", "P-15", "C-15"}

# 지문(Fingerprint) 검사
FP_ENTRY_RE = re.compile(r"^### (LOG-\S+).*?(?=^### |\Z)", re.MULTILINE | re.DOTALL)
FP_TEMPLATE_CODE = "LOG-YYYYMMDD"
# 로그 템플릿이 `- **지문** ★:` 형태라 볼드·별표를 건너뛰지 않으면 실제 엔트리에서
# 필드를 못 찾고 전부 "비었음"으로 오탐한다.
FP_FIELD_RE = re.compile(r"지문\s*\**\s*★?\s*\**\s*[:：]\s*(.*)")
FP_EMPTY_VALUES = {"—", "-", "확인함", "문제 없음", "적절함", "N/A", "없음"}

# 예측 스키마 검사 (prediction-schema.md)
PRED_SCHEMA = "prediction-schema.md"
PRED_REQUIRED = ["metric", "direction", "baseline", "threshold", "horizon", "because"]
# `- metric: save_rate  # 주석` / `- **metric**: save_rate` 양쪽을 다 받는다.
PRED_FIELD_RE = re.compile(r"^\s*[-*]?\s*\**\s*([A-Za-z_]+)\s*\**\s*[:：]\s*(.*?)\s*(?:#.*)?$")
PRED_LABEL_RE = re.compile(r"^\s*[-*]?\s*\**\s*예측\s*\**\s*★?\s*\**\s*[:：]\s*(.*)$", re.MULTILINE)
PRED_DIRECTIONS = {"up", "down", "within"}
PRED_HORIZONS = {"h1", "h24", "h168"}
# because 는 규칙 코드가 원칙이지만 스키마 §3-2 가 `신규` 를 허용한다.
# 실패로 세지는 않되 건수는 드러낸다 — 전부 `신규` 면 신뢰도가 어디에도 안 쌓인다.
PRED_BECAUSE_NEW = {"신규", "new"}
PRED_CODE_RE = re.compile(r"^[RPC]-\d{2}$")

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


def md_files():
    """BASE 아래 모든 .md 를 (표시용 상대경로, 절대경로) 로 돌려준다.

    상대경로는 항상 슬래시로 정규화한다. Windows 에서 os.sep 이 백슬래시라
    SKIP_DIRS 의 `/_setup/` 매칭이 조용히 빗나가던 버그가 있었다.
    """
    return sorted((p.relative_to(BASE).as_posix(), p) for p in BASE.rglob("*.md"))


def skipped(rel):
    return any(f"/{d}/" in f"/{rel}" for d in SKIP_DIRS)


def check_namespace():
    """게이트 G- / 규칙 R-·P- / 로그 접두어가 서로 침범하지 않는가."""
    # 1) 게이트 문서 안의 무패딩 규칙코드 (R-0, P-3) — 게이트 항목과 혼동된다
    # 2) 게이트 헤딩 접두어는 G- 하나뿐
    for name in CORPORA:
        gate = corpus_dir(name) / "02-gate.md"
        if not gate.exists():
            fail(f"{name}/02-gate.md 를 읽을 수 없어 네임스페이스 검사 불가")
            continue
        rel = gate.relative_to(BASE).as_posix()
        text = gate.read_text(encoding="utf-8")
        heads = GATE_HEAD_RE.findall(text)
        bad = sorted(set(UNPADDED_RULE_RE.findall(text)))
        wrong = sorted({h for h in heads if h != "G"})
        print(f"    {rel}: 게이트 헤딩 {len(heads)} 개, 무패딩 규칙코드 {len(bad)} 건")
        if bad:
            fail(f"[NS] {rel}: 무패딩 규칙코드 {bad} — 게이트 항목은 G- 를 쓴다")
        if wrong:
            fail(f"[NS] {rel}: 게이트 헤딩 접두어 {wrong} — G- 여야 한다")

    # 3) 로그 코드는 3~4글자 접두어만
    short = 0
    for rel, path in md_files():
        if skipped(rel):
            continue
        found = sorted(set(SHORT_LOG_RE.findall(path.read_text(encoding="utf-8"))))
        if found:
            short += len(found)
            fail(f"[NS] {rel}: 1글자 로그접두어 {found} — {LOG_PREFIXES} 중 하나여야 한다")
    print(f"    로그 접두어: 1글자 위반 {short} 건")

    # 4) 정의되지 않은 R- / P- / C- 참조
    texts = {rel: p.read_text(encoding="utf-8") for rel, p in md_files() if not skipped(rel)}
    joined = "\n".join(texts.values())
    for key, def_rel, def_pat in CODE_DEFS:
        src = texts.get(def_rel)
        if src is None:
            fail(f"[NS] {def_rel} 이 없어 {key}-xx 정의를 읽을 수 없다")
            continue
        defined = set(re.findall(def_pat, src, re.MULTILINE))
        used = set(re.findall(rf"\b{key}-\d{{2}}\b", joined))
        undef = sorted(used - defined - CODE_DEF_EXEMPT)
        print(f"    {key}-xx: 참조 {len(used)} 종, {def_rel} 정의 {len(defined)} 종")
        if undef:
            fail(f"[NS] 미정의 {key} 코드 참조: {undef}")


def check_paths():
    """백틱으로 적힌 `*.md` 상대경로가 실제로 존재하는가."""
    checked = 0
    broken = 0
    for rel, path in md_files():
        if skipped(rel):
            continue
        base = path.parent
        for ref in sorted(set(PATH_REF_RE.findall(path.read_text(encoding="utf-8")))):
            if Path(ref).name in SKIP_FILES:
                continue
            if ref.startswith("methodology/content"):   # 리포 루트 기준 절대 표기
                target = ROOT / ref
            elif "/" not in ref:                        # 같은 폴더
                target = base / ref
            elif ref.startswith("../"):                 # 명시적 상대
                target = Path(os.path.normpath(base / ref))
            else:                                       # solfa/xx.md = 아카이브 루트 기준
                cand = Path(os.path.normpath(base / ref))
                target = cand if cand.exists() else BASE / ref
            # 아카이브 밖(스킬 references 등)은 검사 대상이 아니다
            try:
                target.resolve().relative_to(BASE.resolve())
            except ValueError:
                continue
            checked += 1
            if not target.exists():
                broken += 1
                fail(f"[PATH] {rel}: 깨진 참조 `{ref}` → {target.relative_to(ROOT).as_posix()} 없음")
    print(f"    아카이브 내부 경로 참조 {checked} 개, 깨진 참조 {broken} 개")
    print(f"    (제외: 디렉터리 {list(SKIP_DIRS)}, 파일 {sorted(SKIP_FILES)})")


def check_fingerprint():
    """`게이트: 통과` 인데 지문이 비면 = 판정한 게 아니라 적기만 한 것."""
    targets = [corpus_dir(n) / "04-decisions.md" for n in CORPORA]
    targets.append(BASE / "cross-decisions.md")
    entries = 0
    empty = 0
    for path in targets:
        if not path.exists():
            continue
        rel = path.relative_to(BASE).as_posix()
        # ``` 로 감싼 블록은 작성용 템플릿이다. 실제 엔트리만 본다.
        body = re.sub(r"```.*?```", "", path.read_text(encoding="utf-8"), flags=re.S)
        for m in FP_ENTRY_RE.finditer(body):
            entry, code = m.group(0), m.group(1)
            if code.startswith(FP_TEMPLATE_CODE):   # 템플릿 자체는 엔트리가 아니다
                continue
            entries += 1
            if not re.search(r"게이트\s*[:：].*통과", entry):
                continue
            fp = FP_FIELD_RE.search(entry)
            val = fp.group(1).strip() if fp else ""
            if not val or val in FP_EMPTY_VALUES:
                empty += 1
                fail(f"[FP] {rel}: {code} — 게이트 통과인데 지문이 비었다 "
                     f"(판정을 안 했거나 무내용 표기)")
    print(f"    판정 로그 엔트리 {entries} 개, 지문 미기입 {empty} 개")
    if entries == 0:
        # ★ 0건 통과와 "검사할 게 없어서 통과"는 다른 사건이다. 구분해서 남긴다.
        notes.append(
            "판정 로그 엔트리가 0건이라 지문 검사가 아무것도 검증하지 못했다 "
            "(템플릿만 있음). 첫 루프 회전 전까지는 이 검사를 근거로 쓰지 마라."
        )


def load_metric_codes():
    """prediction-schema.md §1-1 의 지표 코드를 표에서 읽는다.

    하드코딩하지 않는 이유: Q3(Threads `saves` 가용성) 결과에 따라 이 표가
    바뀔 수 있다. 표를 고쳤는데 검증기가 옛 목록을 들고 있으면 멀쩡한
    예측이 실패로 뜬다.
    """
    path = BASE / PRED_SCHEMA
    if not path.exists():
        fail(f"{PRED_SCHEMA} 가 없어 예측 지표 목록을 읽을 수 없다")
        return None
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^### 1-1\..*?(?=^### 1-2\.)", text, re.MULTILINE | re.DOTALL)
    if not m:
        fail(f"{PRED_SCHEMA} 에서 §1-1 절을 찾지 못했다 (지표 목록 확인 불가)")
        return None
    codes = set()
    for line in m.group(0).splitlines():
        if not line.startswith("|"):
            continue
        cell = line.split("|")[1].strip().strip("*").strip()
        c = cell.strip("`")
        if re.fullmatch(r"[a-z][a-z0-9_]*", c):
            codes.add(c)
    if not codes:
        fail(f"{PRED_SCHEMA} §1-1 에서 지표 코드를 하나도 못 읽었다")
        return None
    return codes


def load_rule_codes():
    """R-xx / P-xx / C-xx 중 실제로 '정의'된 코드 집합."""
    codes = set()
    for _prefix, rel, pattern in CODE_DEFS:
        path = BASE / rel
        if not path.exists():
            continue
        codes |= set(re.findall(pattern, path.read_text(encoding="utf-8"), re.MULTILINE))
    return codes


def check_prediction_schema():
    """판정 로그의 `예측` 이 자동 채점 가능한 형태인가.

    자연어 예측("반응이 좋을 것")은 score-predictions.mjs 에서 전부 보류로
    빠진다. 보류는 실패로 보이지 않기 때문에 루프가 도는 것처럼 보이면서
    아무것도 학습되지 않는다. 그 상태를 여기서 잡는다.
    """
    metrics = load_metric_codes()
    rules = load_rule_codes()
    targets = [corpus_dir(n) / "04-decisions.md" for n in CORPORA]
    targets.append(BASE / "cross-decisions.md")

    entries_with_pred = 0
    items = 0
    bad = 0
    new_because = 0

    for path in targets:
        if not path.exists():
            continue
        rel = path.relative_to(BASE).as_posix()
        # ``` 블록은 작성용 템플릿이다. 검사 9 와 같은 기준으로 걷어낸다.
        body = re.sub(r"```.*?```", "", path.read_text(encoding="utf-8"), flags=re.S)
        for m in FP_ENTRY_RE.finditer(body):
            entry, code = m.group(0), m.group(1)
            if code.startswith(FP_TEMPLATE_CODE):
                continue

            # 구조화 예측 1건 = `metric:` 1개. 여러 지표를 걸 수 있으므로
            # metric 위치로 잘라 항목별로 본다.
            starts = [
                mm.start() for mm in re.finditer(r"^\s*[-*]?\s*\**\s*metric\s*\**\s*[:：]",
                                                 entry, re.MULTILINE)
            ]
            label = PRED_LABEL_RE.search(entry)
            if not starts:
                # 예측 라벨은 있는데 구조화 필드가 없다 = 자연어 예측
                if label:
                    val = label.group(1).strip()
                    if val and val not in FP_EMPTY_VALUES:
                        bad += 1
                        fail(f"[PRED] {rel}: {code} — 자연어 예측이다 "
                             f"(`{val[:40]}`). {PRED_SCHEMA} §3-1 포맷을 써라")
                continue

            entries_with_pred += 1
            bounds = starts + [len(entry)]
            for i, start in enumerate(starts):
                items += 1
                chunk = entry[start:bounds[i + 1]]
                fields = {}
                for line in chunk.splitlines():
                    fm = PRED_FIELD_RE.match(line)
                    if fm:
                        fields.setdefault(fm.group(1), fm.group(2).strip())

                missing = [f for f in PRED_REQUIRED if not fields.get(f)]
                if missing:
                    bad += 1
                    fail(f"[PRED] {rel}: {code} 예측 {i + 1} — 필수 필드 누락 {missing}")
                # 누락이 있어도 나머지 필드는 계속 본다. 한 항목당 한 건만
                # 보고하면 고치고 다시 돌리기를 필드 수만큼 반복하게 된다.

                metric = fields.get("metric", "").strip("`")
                if metric and metrics is not None and metric not in metrics:
                    bad += 1
                    fail(f"[PRED] {rel}: {code} 예측 {i + 1} — metric `{metric}` 은 "
                         f"{PRED_SCHEMA} §1-1 에 없다")

                direction = fields.get("direction", "")
                if direction and direction not in PRED_DIRECTIONS:
                    bad += 1
                    fail(f"[PRED] {rel}: {code} 예측 {i + 1} — direction `{direction}` "
                         f"은 {sorted(PRED_DIRECTIONS)} 중 하나여야 한다")

                horizon = fields.get("horizon", "")
                if horizon and horizon not in PRED_HORIZONS:
                    bad += 1
                    fail(f"[PRED] {rel}: {code} 예측 {i + 1} — horizon `{horizon}` "
                         f"은 {sorted(PRED_HORIZONS)} 중 하나여야 한다")

                because = fields.get("because", "").strip("`")
                if not because:
                    pass                      # 위의 누락 보고로 이미 잡혔다
                elif because in PRED_BECAUSE_NEW:
                    new_because += 1
                elif not PRED_CODE_RE.match(because):
                    bad += 1
                    fail(f"[PRED] {rel}: {code} 예측 {i + 1} — because `{because}` 가 "
                         f"규칙 코드 형식(R-xx/P-xx/C-xx)이 아니다")
                elif because not in rules:
                    bad += 1
                    fail(f"[PRED] {rel}: {code} 예측 {i + 1} — because `{because}` 는 "
                         f"정의되지 않은 규칙이다")

    print(f"    예측이 달린 엔트리 {entries_with_pred} 개, 예측 항목 {items} 개, "
          f"위반 {bad} 개"
          + (f", because=신규 {new_because} 개" if new_because else ""))
    if items == 0:
        # ★ 검사 9 와 같은 이유. 0건 통과를 검증 성공으로 읽으면 안 된다.
        notes.append(
            "구조화된 예측이 0건이라 예측 스키마 검사가 아무것도 검증하지 못했다. "
            "첫 루프 회전 전까지는 이 검사를 근거로 쓰지 마라."
        )


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

    print("\n[7] 코드 네임스페이스 규약")
    check_namespace()

    print("\n[8] 백틱 .md 경로 참조 실존")
    check_paths()

    print("\n[9] 판정 로그 지문(Fingerprint)")
    check_fingerprint()

    print("\n[10] 판정 로그 예측 스키마")
    check_prediction_schema()

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
