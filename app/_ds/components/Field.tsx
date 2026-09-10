import React from 'react'

/**
 * Field / Input / Select / Textarea — 폼 컨트롤.
 *
 * 원본: "Dothegy Works Design System/components/forms/{Input,Select}.jsx".
 * 원본은 focus 링을 React state 로 그렸지만, 여기서는 상태 없이
 * `.dgy-field:focus` 규칙(app/_ds/styles.css) 하나로 처리한다 —
 * 같은 결과이고 서버/클라이언트 어디서 렌더하든 안전하다.
 */

const CONTROL: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 36,
  padding: '0 10px',
  background: 'var(--surface-card)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--text-body)',
  outline: 'none',
  transition: 'border-color var(--dur-fast), box-shadow var(--dur-fast)',
}

/** 라벨 — 12px medium, muted. */
export const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
}

type FieldProps = {
  label: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}

/** 라벨 + 컨트롤 + (선택) 힌트 한 묶음. */
export function Field({ label, htmlFor, hint, children, style }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, ...style }}>
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {children}
      {hint ? <span style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>{hint}</span> : null}
    </div>
  )
}

export function Input({ style, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="dgy-field" style={{ ...CONTROL, ...style }} {...rest} />
}

export function Textarea({ style, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="dgy-field"
      style={{ ...CONTROL, height: 'auto', padding: '10px', lineHeight: 1.65, resize: 'vertical', ...style }}
      {...rest}
    />
  )
}

export function Select({ style, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div style={{ position: 'relative', display: 'flex', width: '100%', minWidth: 0 }}>
      <select
        className="dgy-field"
        style={{
          ...CONTROL,
          appearance: 'none',
          WebkitAppearance: 'none',
          padding: '0 32px 0 10px',
          cursor: 'pointer',
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          pointerEvents: 'none', color: 'var(--text-muted)',
        }}
      >
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
