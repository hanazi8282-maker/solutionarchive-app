// 대조 시험용 preload(--import): DB 를 바꿀 수 있는 요청(GET·HEAD 밖)은 보내지 않고 실패시킨다.
const real = globalThis.fetch
globalThis.fetch = (input, init) => {
  const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return Promise.reject(new Error(`readonly-guard: ${method} 요청 차단`))
  return real(input, init)
}
