'use client'

import { FACET_FIELDS, type FacetKey } from '@/lib/analysis/facets'
import { Field, Select } from './Field'

/**
 * PMF 진단 입력 5개(어휘 고정). /analyze/new 1단계와 /settings/profile 이 같이 쓴다 —
 * 두 화면이 각자 옵션 목록을 적으면 한쪽만 어휘가 늘어나 조용히 갈라진다.
 *
 * 고른 값의 설명을 셀렉트 **아래**에 띄운다. native <select> 의 <option> 은 두 줄을 못
 * 그리는데, 어휘가 영어 대문자라 라벨만으로는 무슨 뜻인지 모르고 아무거나 고르게 된다.
 */
export type FacetValues = Partial<Record<FacetKey, string>>

export function FacetSelects({ values, onChange, disabled = false, idPrefix = '' }: {
  values: FacetValues
  onChange: (key: FacetKey, value: string) => void
  disabled?: boolean
  idPrefix?: string
}) {
  return (
    <>
      {FACET_FIELDS.map((f) => {
        const v = values[f.key] ?? ''
        const picked = f.options.find((o) => o.value === v)
        const id = `${idPrefix}${f.key}`
        return (
          <Field key={f.key} label={f.label} htmlFor={id} hint={picked ? picked.hint : f.hint}>
            <Select id={id} value={v} disabled={disabled} onChange={(e) => onChange(f.key, e.target.value)}>
              <option value="">선택 안 함</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        )
      })}
    </>
  )
}
