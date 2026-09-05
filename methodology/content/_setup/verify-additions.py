#!/usr/bin/env python3
"""
verify-methodology-archive.py 에 추가할 검사 2종.
기존 §n-m 댕글링 검사가 잡지 못하는 두 가지 사고 유형을 커버한다.
  A. 코드 네임스페이스 충돌  (게이트 G-x vs 규칙 R-xx/P-xx vs 로그 LOG-)
  B. 상대경로 파일 참조 깨짐  (`prompts/foo.md` 같은 백틱 경로가 실존하는가)
"""
import re, sys, os, glob

ROOT = "methodology/content"
FAIL = []

# ── A. 네임스페이스 충돌 검사 ────────────────────────────────────
NS = {
    "G":  ("게이트 항목", r"G-(?:\d{1,2}|R)\b"),
    "R":  ("솔파 규칙",   r"R-\d{2}\b"),
    "P":  ("프드프 규칙", r"P-\d{2}\b"),
    "C":  ("교차 판정",   r"C-\d{2}\b"),
    "U":  ("통합 공통관문", r"U-[1-3]\b"),
    "D":  ("통합 조건분기", r"D-[1-5]\b"),
    "X":  ("통합 충돌",   r"X-[1-3]\b"),
}
LOGS = ["LOG-", "UPD-", "NEW-", "XUP-"]

def check_namespace():
    # 1) 게이트 파일 안에서 무패딩 R-/P- 사용 금지 (규칙과 혼동)
    for gate in glob.glob(f"{ROOT}/*/02-gate.md"):
        s = open(gate, encoding="utf-8").read()
        bad = re.findall(r"\b[RP]-\d\b(?!\d)", s)   # R-0, P-3 처럼 무패딩
        if bad:
            FAIL.append(f"[NS] {gate}: 무패딩 규칙코드 {sorted(set(bad))} "
                        f"— 게이트 항목은 G- 를 써야 함")
    # 2) 게이트 헤딩은 반드시 G-
    for gate in glob.glob(f"{ROOT}/*/02-gate.md"):
        s = open(gate, encoding="utf-8").read()
        heads = re.findall(r"^## ([A-Z]+)-", s, flags=re.M)
        wrong = sorted({h for h in heads if h != "G"})
        if wrong:
            FAIL.append(f"[NS] {gate}: 게이트 헤딩 접두어 {wrong} — G- 여야 함")
    # 3) 로그 코드는 3~4글자 접두어만
    for f in glob.glob(f"{ROOT}/**/*.md", recursive=True):
        s = open(f, encoding="utf-8").read()
        bad = re.findall(r"\b[A-Z]-YYYYMMDD", s)     # D-YYYYMMDD 같은 1글자
        if bad:
            FAIL.append(f"[NS] {f}: 1글자 로그접두어 {sorted(set(bad))} "
                        f"— {LOGS} 중 하나여야 함")
    # 4) 정의되지 않은 코드 참조
    defs = {}
    for f, pat, key in [
        (f"{ROOT}/solfa/04-decisions.md", r"^### (R-\d{2})\.", "R"),
        (f"{ROOT}/pdp/04-decisions.md",   r"^### (P-\d{2})\.", "P"),
        (f"{ROOT}/cross-decisions.md",    r"^## \d+\. (C-\d{2})\.", "C"),
    ]:
        if os.path.exists(f):
            defs[key] = set(re.findall(pat, open(f, encoding="utf-8").read(), flags=re.M))
    allsrc = "\n".join(open(f, encoding="utf-8").read()
                       for f in glob.glob(f"{ROOT}/**/*.md", recursive=True))
    for key, pat in [("R", r"\bR-\d{2}\b"), ("P", r"\bP-\d{2}\b"), ("C", r"\bC-\d{2}\b")]:
        used = set(re.findall(pat, allsrc))
        undef = sorted(used - defs.get(key, set()) - {f"{key}-15", f"{key}-13"} if key == "C"
                       else used - defs.get(key, set()))
        undef = [u for u in undef if u not in (f"{key}-15",)]   # 승격 예정 언급 허용
        if undef:
            FAIL.append(f"[NS] 미정의 {key} 코드 참조: {undef}")

# ── B. 상대경로 파일 참조 검사 ──────────────────────────────────
PATH_RE = re.compile(r"`((?:\.\./)*[\w./-]+\.md)`")
# 아카이브 밖에 있거나 프롬프트 예시라서 검사 대상이 아닌 것
SKIP_DIRS  = ("_setup",)                    # 프롬프트 원문 안의 예시 경로
SKIP_FILES = {"insight-guide.md",           # 아카이브 밖 문서
              "SKILL.md"}

def check_paths():
    for f in glob.glob(f"{ROOT}/**/*.md", recursive=True):
        if any(f"/{d}/" in f for d in SKIP_DIRS):
            continue
        base = os.path.dirname(f)
        s = open(f, encoding="utf-8").read()
        for ref in set(PATH_RE.findall(s)):
            if os.path.basename(ref) in SKIP_FILES:
                continue
            if ref.startswith(ROOT):              # 리포 루트 기준 절대 표기
                target = ref
            elif "/" not in ref:                  # 같은 폴더 파일
                target = os.path.join(base, ref)
            elif ref.startswith("../"):           # 명시적 상대
                target = os.path.normpath(os.path.join(base, ref))
            else:                                 # solfa/xx.md 같은 표기 = 루트 기준
                cand = os.path.normpath(os.path.join(base, ref))
                target = cand if os.path.exists(cand) else os.path.join(ROOT, ref)
            # 아카이브 밖(스킬 references 등)은 건너뜀
            if not os.path.normpath(target).startswith(ROOT):
                continue
            if not os.path.exists(target):
                FAIL.append(f"[PATH] {f}: 깨진 참조 `{ref}` → {target} 없음")

# ── C. 지문 누락 검사 ───────────────────────────────────────────
def check_fingerprint():
    """게이트: 통과 인데 지문이 비어 있으면 = 판정을 안 한 것"""
    for f in glob.glob(f"{ROOT}/*/04-decisions.md") + [f"{ROOT}/cross-decisions.md"]:
        if not os.path.exists(f):
            continue
        s = open(f, encoding="utf-8").read()
        # 템플릿(```로 감싼 블록)은 제외하고 실제 엔트리만 본다
        body = re.sub(r"```.*?```", "", s, flags=re.S)
        for m in re.finditer(r"^### (LOG-\S+).*?(?=^### |\Z)", body, flags=re.M | re.S):
            entry, code = m.group(0), m.group(1)
            if re.search(r"게이트\s*[:：].*통과", entry):
                fp = re.search(r"지문\s*[:：]\s*(.*)", entry)
                val = fp.group(1).strip() if fp else ""
                # 무내용 표기도 실패
                if not val or val in {"—", "-", "확인함", "문제 없음", "적절함", "N/A"}:
                    FAIL.append(f"[FP] {f}: {code} — 게이트 통과인데 지문이 비었음 "
                                f"(판정을 안 했거나 무내용 표기)")

if __name__ == "__main__":
    check_namespace()
    check_paths()
    check_fingerprint()
    if FAIL:
        print("\n".join(FAIL)); print(f"\n실패 {len(FAIL)}건"); sys.exit(1)
    print("네임스페이스·경로 검사 통과 ✅"); sys.exit(0)
