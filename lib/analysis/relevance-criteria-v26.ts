// 판정 기준 v2.6 **후보**(v71dm, 2026-11-23) — 운영에 적용하지 않는다. ⛔ 머지 금지 — 30건 회귀에서 뒤집힘 8건(한도 3)으로 기준 미달. 비교 스크립트 scripts/v26-compare.mjs 만 쓴다.
//
// v2.6 = v2.4 본문 그대로 + 규칙 (21)~(23). 추가 전용이다:
//   - relevance-criteria.ts(v2.4 이하·v2.5 상수·함수)와 relevance-judge.ts(운영 기준 선택 opts.criteria)는 한 글자도 바꾸지 않는다.
//     그래서 이 파일은 운영 v2.4 시스템 프롬프트를 받아 그 안의 v2.4 기준 블록만 v2.6 으로 바꿔 끼운다(systemV26FromV24).
//   - 예시는 전부 지어낸 것이다(실제 수집 글·채점 표본을 싣지 않는다). 제품 이름도 X·Y 로 가린다.
// 운영 적용은 사람이 비교 결과를 보고 따로 정한다(그때 relevance-judge.ts 에 'v26' 을 더하는 별도 PR).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/v26-selftest.mjs.

import { RELEVANCE_V24_VERSION, relevanceCriteriaV24 } from './relevance-criteria.ts'

export const RELEVANCE_V26_VERSION = 'v26-2026-11-23'

export const RELEVANCE_V26_BLOCK = [
  '',
  '',
  '[v2.6 추가 — 개발자 대상 글·지나가는 언급·약한 정보]',
  '회사 이야기·자사 홍보와 부딪치면 (21)~(23)이 (9)·(14)보다 우선한다. 앱스토어·구글 플레이 후기의 오류 불평은 (21)의 대상이 아니다 — 사용자가 겪은 불편이라 사용자 목소리다.',
  '(21) 개발자·관리자를 향한 글은 irrelevant 다. 넷 중 하나이고, 제품을 쓰거나·고르거나·떠나는 사람의 경험·기준이 한 문장도 없을 때다: ' +
    '① 개발자에게 보내는 버그 리포트(재현 절차·버전·환경·스택 트레이스·로그가 중심) ' +
    '② 소스 코드·내부 구조 분석(파일 경로·함수 이름을 따라가며 원인을 짚는 글) ' +
    '③ 시스템·개발자 시점의 불만(예: 플러그인 제작자가 마켓 수수료 때문에 자기 수익이 줄었다고 불평 — 제품 사용자의 판단이 아니다) ' +
    '④ 자가 설치·운영 안내(설치 명령·설정 파일·서버 구성·운영 환경에 무엇이 필요한지). ' +
    '지어낸 예: irrelevant — "3.2 로 올린 뒤 내보내기가 실패한다. 재현: 설정 → 내보내기 → 저장. 로그 첨부", "소스를 따라가 보니 Sync::run 이 캐시를 비우지 않는다", ' +
    '"운영 설치에는 이 확장이 필요 없다. 설정 파일에서 끄고 설치 명령을 다시 돌리면 된다". ' +
    'relevant — "업데이트 뒤로 동기화가 자꾸 끊겨서 결국 다른 노트 앱으로 옮겼다"(사용자가 겪은 불편과 떠난 이유).',
  '(22) 지나가는 언급: 제품 이름이 나오는 문장이 그 제품의 동작·가격·품질에 대한 판단이 아니면 info=false 다(relevant 여부와 따로 본다). ' +
    '지어낸 예: "회의 끝나고 X 로 메모를 정리하다 든 생각인데, 우리 팀 문화가 문제다" — X 는 배경으로 지나갈 뿐이다.',
  '(23) 약한 정보도 정보다: 제품을 지목하고 이유나 동작 판단을 붙인 문장이 하나라도 있으면 info=true 다. 짧고 약해도 오류가 아니다. ' +
    '지어낸 예: "X 는 검색이 느려서 답답하다", "Y 는 무료 요금제로도 충분했다".',
].join('\n')

/** v2.6 판정 기준 본문 = v2.4 본문(머리글 두 곳만 v2.6) + RELEVANCE_V26_BLOCK. 치환이 안 먹으면 던진다(§7.1). */
export function relevanceCriteriaV26(activeAreaNames: readonly string[]): string {
  const out = relevanceCriteriaV24(activeAreaNames)
    .replace(`기준 버전 ${RELEVANCE_V24_VERSION}`, `기준 버전 ${RELEVANCE_V26_VERSION}`)
    .replace('## 판정 기준 v2.4', '## 판정 기준 v2.6')
    + RELEVANCE_V26_BLOCK
  if (!out.includes('## 판정 기준 v2.6 (기준 버전 ' + RELEVANCE_V26_VERSION + ')') || out.includes('기준 버전 ' + RELEVANCE_V24_VERSION) || out.includes('## 판정 기준 v2.4')) throw new Error('v2.6 판정 기준: 버전 치환 실패')
  return out
}

/**
 * 운영 v2.4 1차 시스템 프롬프트(buildRelevancePrompt(..., { criteria: 'v24' }).system)를 받아 v2.6 으로 바꾼다(순수).
 * 바꾸는 곳은 v2.4 기준 블록과 "아래 판정 기준 v2.4 로" 한 줄뿐 — 출력 형식·info 질문·라벨 지시는 운영과 같다.
 * 받은 글이 v2.4 프롬프트가 아니면(블록을 못 찾으면) 던진다 — 조용히 v2.4 로 판정하지 않는다(§7.1).
 */
export function systemV26FromV24(v24System: string, activeAreaNames: readonly string[]): string {
  const v24 = relevanceCriteriaV24(activeAreaNames)
  // 함수 치환 — 기준 문구에 `$` 가 들어가도 치환 패턴으로 읽히지 않게.
  const out = v24System.replace(v24, () => relevanceCriteriaV26(activeAreaNames)).replace('아래 판정 기준 v2.4 로', '아래 판정 기준 v2.6 로')
  if (out.includes('판정 기준 v2.4') || !out.includes('(23) 약한 정보도 정보다') || !out.includes('아래 판정 기준 v2.6 로')) throw new Error('v2.6 시스템 프롬프트 치환 실패')
  return out
}
