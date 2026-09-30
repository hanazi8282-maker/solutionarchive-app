// 속성 원문 인용(evidence_quotes) + 한국어 번역(evidence_quotes_ko) → 화면 한 줄씩.
// 검수 화면(/analyze/[id]/review)과 인사이트(/insights)가 같은 규칙을 쓴다 — 마크업만 각자다.
//
// ★ 번역은 원문과 길이가 같을 때만 쓴다. 어긋나면 어느 번역이 어느 원문인지 모르니 전부 "번역 전" 으로 본다.
// ★ 번역이 원문과 같으면(원문이 이미 한국어) 원문만 낸다 — 접힘에 같은 문장을 두 번 두지 않는다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(셀프테스트). `@/` 별칭을 쓰지 않는다.

export interface QuoteRow { text: string; source_type?: string | null }

export interface QuoteLine {
  /** 원문(정본). */
  text: string
  source_type: string | null
  /** 원문과 다른 한국어 번역. null = 번역을 안 쓴다(번역 전이거나 원문이 이미 한국어). */
  ko: string | null
  /** true = 이 속성 인용 전체가 번역 전(NULL·길이 불일치). 원문 옆에 "번역 전" 을 단다. */
  untranslated: boolean
}

export function quoteLines(quotes: QuoteRow[] | null | undefined, quotesKo: unknown): QuoteLine[] {
  if (!quotes) return []
  const ko = Array.isArray(quotesKo) && quotesKo.length === quotes.length ? (quotesKo as unknown[]) : null
  return quotes.map((q, i) => {
    const k = ko?.[i]
    return {
      text: q.text,
      source_type: q.source_type ?? null,
      ko: typeof k === 'string' && k && k !== q.text ? k : null,
      untranslated: ko === null,
    }
  })
}
