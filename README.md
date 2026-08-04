# TODO App

마감일·우선순위·태그로 할 일을 정리하고, 필터와 검색으로 지금 할 일만 골라볼 수 있는 **개인용 TODO 웹 앱**.

SvelteKit 2 (Svelte 5) + SQLite. 서버·클라우드 계정 없이 로컬에서 실행한다.

## ⚠️ 보안: 인증이 없습니다

이 앱은 **단일 사용자 전제**로 만들어졌고 로그인·인증 기능이 없다.
**노출되면 접근 가능한 누구나 모든 할 일을 읽고 쓰고 지울 수 있다.**

바인딩 주소를 반드시 확인할 것:

| 실행 방법 | 바인딩 | 안전 |
|---|---|---|
| `npm run dev` | `localhost` (Vite 기본값) | ✅ |
| `npm start` | `127.0.0.1` (스크립트가 `HOST`를 고정) | ✅ |
| `node build` 직접 실행 | **`0.0.0.0`** — `adapter-node` 기본값 | ❌ 네트워크에 노출됨 |

프로덕션 실행은 `node build`가 아니라 **`npm start`**를 쓴다. `node build`를 직접 쓰면
`HOST=127.0.0.1`을 반드시 함께 지정한다.

외부 노출이 필요하면 먼저 인증을 도입해야 한다 ([docs/PRD.md](docs/PRD.md) §11 F-1, Better Auth 기준).

## 시작하기

```bash
npm install && npm run db:migrate && npm run dev
```

`.env`가 없으면 만든다 (`.env.example` 참고):

```
DB_URL=file:./data/todo.db
```

데모 데이터가 필요하면:

```bash
npm run db:seed
```

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`adapter-node`) |
| `npm start` | 빌드 결과 실행 — `127.0.0.1`에만 바인딩 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run check` | `svelte-check` 타입 검사 |
| `npm run db:generate` | 스키마 변경 → 마이그레이션 SQL 생성 |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:push` | 마이그레이션 파일 없이 DB 직접 변형 — **로컬 탐색용만** |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | 데모 데이터 (할 일이 이미 있으면 건너뜀) |
| `npm run db:backup` | 백업 파일 생성 (`data/backup/`) |

## 백업

```bash
npm run db:backup
```

`VACUUM INTO`로 단일 파일을 만든다. **`data/todo.db`만 복사하면 안 된다** — WAL 모드에서는
최근 커밋이 `-wal` 파일에만 있어 유실된다. 자세한 절차는 [docs/ERD.md](docs/ERD.md) §7.

복원은 백업 파일을 `DB_URL` 경로로 복사하고, 기존 `-wal`·`-shm` 파일을 삭제한다.

## 구조

```
src/
├── app.css                     와이어프레임 스타일 (무채색)
├── lib/
│   ├── types.ts                도메인 타입, 입력 길이 제한
│   ├── date.ts                 날짜 헬퍼, 마감 상태 판정
│   ├── query.ts                URL 쿼리 파싱, form action 조립
│   └── server/
│       ├── store.ts            데이터 접근 계층 (검증 + 쿼리)
│       └── db/
│           ├── schema.ts       테이블·인덱스·CHECK 정의
│           ├── client.ts       커넥션 + PRAGMA
│           ├── drizzle.config.ts
│           └── migrations/     커밋되는 마이그레이션 SQL
└── routes/
    ├── +layout.svelte          전역 헤더
    ├── +page.*                 SC-01 할 일 목록
    ├── tasks/[id]/+page.*      SC-02 상세·수정
    ├── tags/+page.*            SC-03 태그 관리
    └── +error.svelte           SC-04 오류 / 없음
```

DB 접근 코드는 모두 `src/lib/server/` 아래에 둔다. 클라이언트 번들에 포함되지 않는다.

## 설계 메모

- **JS 없이도 동작한다.** 추가·완료 토글·수정·삭제는 form actions로, 필터·검색·정렬은 GET 폼으로
  처리한다. JS가 있으면 `use:enhance`가 전체 리로드를 없앤다.
- **필터 상태는 URL이 유일한 출처다.** 북마크·새로고침 후에도 조건이 유지된다.
- **삭제는 서버 왕복 2단계**다. JS 전용 확인 대화상자를 쓰지 않으므로 JS 유무에 따른 차이가 없다.
- **`adapter-node`를 쓴다.** `adapter-auto`는 서버리스로 붙어 로컬 SQLite 파일을 쓸 수 없다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PRD.md](docs/PRD.md) | 이해관계자, 에픽·피처·사용자 스토리, 기능/비기능 요구사항 |
| [docs/ERD.md](docs/ERD.md) | 테이블 정의, 인덱스, PRAGMA, 마이그레이션·백업 정책 |
| [docs/SCREENS.md](docs/SCREENS.md) | IA, 화면 와이어프레임, 시나리오, 공통 UI 규칙 |

## 알려진 제약

- `npm audit`에 dev 의존성 관련 경고 2건이 있다 (`drizzle-kit` → `esbuild`, `@sveltejs/kit` → `cookie`).
  수정하려면 다운그레이드가 필요해 그대로 두었다. 런타임 코드에는 영향이 없다.
- 반복 일정·알림·서브태스크·다중 사용자는 범위에 없다 ([docs/PRD.md](docs/PRD.md) §2.2).
