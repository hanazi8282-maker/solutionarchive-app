Primary interactive control — use for any action the user can take.

```jsx
<Button variant="primary" leftIcon={<Icon name="download" />}>지금 수집</Button>
<Button variant="neutral">저장</Button>
<Button variant="outline" size="sm">CSV 내보내기</Button>
<Button variant="ghost">닫기</Button>
<Button variant="destructive">삭제</Button>
<Button disabled>수정 (Auth 연결 후)</Button>
```

Variants: `primary` (blue CTA), `neutral` (near-black default), `outline`, `ghost`, `destructive`.
Sizes: `sm` (30px) · `md` (36px) · `lg` (42px). Supports `leftIcon`/`rightIcon`, `disabled`, `fullWidth`.
