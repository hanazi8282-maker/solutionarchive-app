// 다나와 상품 상세 URL → pcode. 순수 함수 — DB·네트워크 없음.
//
// ⚠️ 추측해서 파싱하지 않는다. 상품 상세 URL(주소에 pcode 가 있는 것)이 아니면
//    거절한다. "숫자처럼 보이는 것"을 주워 담으면 카테고리 ID 를 상품 ID 로
//    잘못 넣고, 그때부터 엉뚱한 상품의 리뷰가 그 프로젝트에 쌓인다.
//
// 두 곳이 쓴다:
//   - app/api/analyze/targets  : 수집 타깃 등록 시 pcode 확정
//   - app/api/analyze/projects : reverse 모드 진입 시 "다나와 URL 인가" 게이트(결정 B)
//   규칙을 두 벌 두지 않으려고 여기로 뺐다.

const EXAMPLE = 'https://prod.danawa.com/info/?pcode=252495223'

export type DanawaUrlResult = { ok: true; pcode: string } | { ok: false; error: string }

export function parseDanawaProductUrl(raw: string): DanawaUrlResult {
  let url: URL
  try {
    url = new URL((raw ?? '').trim())
  } catch {
    return { ok: false, error: `다나와 상품 상세 페이지 URL을 그대로 붙여넣어 주세요. (예: ${EXAMPLE})` }
  }

  const pcode = url.searchParams.get('pcode')?.trim() ?? ''
  if (!pcode) {
    return {
      ok: false,
      error:
        '상품 상세 페이지 URL이 아닙니다. 주소에 pcode 가 있어야 합니다. ' +
        `(예: ${EXAMPLE}) ` +
        '검색 결과 페이지나 카테고리 URL은 어느 상품인지 특정할 수 없어 받지 않습니다.',
    }
  }

  return { ok: true, pcode }
}
