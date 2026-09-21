/**
 * 숫자·인용 아래 한 줄 근거 캡션 — "몇 건 중 몇 건 · 어느 기간 · 어디서 · 어떻게 셌나".
 *
 * §7.1: 세 상태를 **문장으로** 가른다. 0건(셌는데 없었다)과 확인 불가(못 셌다)를
 * 같은 `—` 로 뭉개면, 못 읽은 것이 "없음"으로 굳는다.
 *   n === null → "확인 불가 — {method}"
 *   n === 0    → "검증된 {noun} 없음 ({method})"   (noun 기본 '인용', 케이스 근거 행이면 '근거')
 *   그 밖      → "{n}건" 또는 total 이 있으면 "{n}/{total}건" · {period} · {source} · {method}
 * 없는 조각은 빼되 구분점이 남지 않게 붙인다. total 을 모르면 '?' 를 찍지 않고 분모를 뺀다.
 *
 * 소비처: result(인용) · review(인용) · cases(근거 행). remedy 는 실패 사례 줄에 안 쓴다.
 */
export function EvidenceCaption({ n, total, period, source, method, noun = '인용' }: {
  n: number | null
  total: number | null
  period?: string
  source?: string
  method: string
  noun?: string
}) {
  const text = n === null
    ? `확인 불가 — ${method}`
    : n === 0
      ? `검증된 ${noun} 없음 (${method})`
      : [total == null ? `${n}건` : `${n}/${total}건`, period, source, method].filter(Boolean).join(' · ')

  return (
    <p style={{
      margin: 0, fontSize: 'var(--fs-xs)', lineHeight: 1.5,
      color: 'var(--text-muted)', overflowWrap: 'anywhere',
    }}>
      {text}
    </p>
  )
}
