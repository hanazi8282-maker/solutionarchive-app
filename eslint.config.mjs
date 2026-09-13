// ESLint 9 는 flat config 가 필수다. 이 파일도 .eslintrc 도 없어서
// `npm run lint` 가 리포 전체에서 한 번도 실행된 적이 없었다 (이슈 #51).
//
// eslint-config-next 16 은 flat config 배열을 그대로 내보낸다 —
// FlatCompat 로 감쌀 필요가 없다.
import next from 'eslint-config-next'

const config = [
  {
    // 검사 대상 밖. 각 항목이 왜 빠지는지 이유가 있다.
    ignores: [
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      // ai-office 는 스택이 다른 하위 프로젝트다 (CLAUDE.md §2.1).
      // 자기 eslint.config.mjs 를 따로 갖고 있으니 여기서 겹쳐 보지 않는다.
      'ai-office/**',
      // MANIFEST md5 대조가 걸린 append-only 아카이브 (§10.1).
      // 린트가 고치라고 해도 고칠 수 없는 영역이다.
      'methodology/**',
      // 작업 잔재 보관소. 현재 코드가 아니다.
      '_archive/**',
    ],
  },
  ...next,
]

export default config
