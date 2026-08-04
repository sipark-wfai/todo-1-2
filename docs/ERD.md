# TODO App — 데이터 모델 (ERD)

| 항목 | 내용 |
|---|---|
| 문서 버전 | 1.0 |
| 작성일 | 2026-08-04 |
| 대상 DB | SQLite (파일 기반) |
| 접근 계층 | Drizzle ORM + better-sqlite3 |
| 관련 문서 | [PRD.md](PRD.md), [SCREENS.md](SCREENS.md) |

---

## 1. 엔티티 관계도

```mermaid
erDiagram
    TASKS ||--o{ TASK_TAGS : "has"
    TAGS  ||--o{ TASK_TAGS : "applied to"

    TASKS {
        integer id PK
        text    title "NOT NULL, 1~200자"
        text    description "NULL, ~2000자"
        integer completed_at "NULL = 미완료"
        integer due_date "NULL 허용, 날짜(자정 기준)"
        integer priority "1=낮음 2=보통(기본) 3=높음"
        integer created_at "NOT NULL"
        integer updated_at "NOT NULL"
    }

    TAGS {
        integer id PK
        text    name "NOT NULL, UNIQUE(NOCASE), 1~30자"
        integer created_at "NOT NULL"
    }

    TASK_TAGS {
        integer task_id PK,FK
        integer tag_id  PK,FK
    }
```

**관계 요약**

| 관계 | 카디널리티 | 설명 |
|---|---|---|
| TASKS ↔ TAGS | N : M | 하나의 할 일에 여러 태그, 하나의 태그가 여러 할 일에 (FR-401) |
| TASKS → TASK_TAGS | 1 : 0..N | 할 일 삭제 시 연결 CASCADE 삭제 (FR-109) |
| TAGS → TASK_TAGS | 1 : 0..N | 태그 삭제 시 연결만 CASCADE 삭제, 할 일은 유지 (FR-404) |

> `users` 테이블은 없다. 단일 사용자 전제(PRD 가정 A1)의 직접적 결과이며, 다중 사용자로 전환하면 §7의 변경이 필요하다.

---

## 2. 테이블 정의

### 2.1 `tasks` — 할 일

| 컬럼 | 타입 | 제약 | 기본값 | 설명 |
|---|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | — | 대리 키 |
| `title` | TEXT | NOT NULL, `length(trim(title)) BETWEEN 1 AND 200` | — | 할 일 제목 (FR-102, FR-103) |
| `description` | TEXT | NULL, `length(description) <= 2000` | NULL | 상세 설명 (FR-103) |
| `completed_at` | INTEGER | NULL | NULL | 완료 시각(Unix 초). **NULL = 미완료** (FR-107) |
| `due_date` | INTEGER | NULL | NULL | 마감일. 해당 날짜 로컬 자정의 Unix 초 (FR-201) |
| `priority` | INTEGER | NOT NULL, `IN (1,2,3)` | 2 | 1=낮음, 2=보통, 3=높음 (FR-301) |
| `created_at` | INTEGER | NOT NULL | 현재 시각 | 생성 시각 |
| `updated_at` | INTEGER | NOT NULL | 현재 시각 | 마지막 수정 시각 (FR-106) |

**인덱스**

| 인덱스 | 컬럼 | 목적 |
|---|---|---|
| `idx_tasks_completed_at` | `completed_at` | 상태 필터 (FR-503) |
| `idx_tasks_due_date` | `due_date` | 마감일 필터·정렬 (FR-502, FR-505) |
| `idx_tasks_due_priority` | `due_date`, `priority DESC` | 기본 정렬 복합 인덱스 (FR-502, NFR-104) |

### 2.2 `tags` — 태그

| 컬럼 | 타입 | 제약 | 기본값 | 설명 |
|---|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | — | 대리 키 |
| `name` | TEXT | NOT NULL, UNIQUE **COLLATE NOCASE**, `length(trim(name)) BETWEEN 1 AND 30` | — | 태그 이름 (FR-402, FR-403) |
| `created_at` | INTEGER | NOT NULL | 현재 시각 | 생성 시각 |

> `COLLATE NOCASE` UNIQUE 제약이 "대소문자를 무시한 중복 거부"(FR-402)를 **DB 레벨에서** 보장한다. 애플리케이션 검사에만 의존하지 않는다.

### 2.3 `task_tags` — 할 일-태그 연결

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `task_id` | INTEGER | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE | |
| `tag_id` | INTEGER | NOT NULL, FK → `tags(id)` ON DELETE CASCADE | |
| — | — | PRIMARY KEY (`task_id`, `tag_id`) | 동일 태그 중복 연결 방지 |

**인덱스**

| 인덱스 | 컬럼 | 목적 |
|---|---|---|
| (복합 PK) | `task_id`, `tag_id` | 할 일 기준 태그 조회 |
| `idx_task_tags_tag_id` | `tag_id` | 태그 기준 할 일 조회 = 태그 필터 (FR-504) |

> 복합 PK는 `task_id`가 선행이므로 `tag_id` 단독 조회를 커버하지 못한다. 태그 필터 성능을 위해 `idx_task_tags_tag_id`가 **별도로 필요**하다.

---

## 3. 설계 결정 및 트레이드오프

### 3.1 완료 상태를 `completed_at` 단일 컬럼으로 표현
- **결정**: `status` 열거형 컬럼을 두지 않고 `completed_at IS NULL`로 미완료를 판정한다.
- **근거**: 완료 여부와 완료 시각을 한 컬럼이 담아 두 컬럼 간 불일치(`status='done'` 인데 `completed_at IS NULL`) 상태가 **구조적으로 발생할 수 없다**.
- **대가**: 쿼리에 `WHERE completed_at IS NULL`이 반복 등장한다. 조회 함수로 감싸 해결한다.

### 3.2 우선순위를 INTEGER(1/2/3)로 저장
- **결정**: TEXT(`'high'|'medium'|'low'`)가 아니라 INTEGER.
- **근거**: TEXT는 알파벳 정렬이 `high < low < medium`으로 의미와 어긋나 정렬에 CASE 식이 필요하다. INTEGER는 `ORDER BY priority DESC`가 그대로 "높음 우선"이 된다(FR-502).
- **대가**: 숫자 자체는 의미가 드러나지 않아 코드에 상수 매핑이 필요하다.

### 3.3 마감일을 날짜 단위 INTEGER로 저장
- **결정**: 해당 날짜 **로컬 자정의 Unix 초**를 저장한다 (PRD 가정 A4).
- **근거**: `<input type="date">` 입력과 1:1 대응되고, "오늘/이번 주/지남" 필터가 정수 비교로 끝난다.
- **대가**: 타임존이 다른 환경에서 DB 파일을 열면 날짜가 하루 밀릴 수 있다. 단일 사용자·단일 호스트 전제(A2)에서 수용한다. 시각 단위 마감이 필요해지면 저장 형식을 재검토한다.

### 3.4 정수 대리 키(AUTOINCREMENT)
- **결정**: nanoid/UUID가 아니라 INTEGER AUTOINCREMENT.
- **근거**: 단일 노드·단일 사용자이므로 분산 ID 생성이 불필요하고, 인덱스 크기와 조인 비용이 작다. URL(`/tasks/3`)도 짧다.
- **대가**: ID가 순차 노출되어 총 건수를 추측할 수 있다. 인증 없는 개인용 로컬 앱이므로 위협이 아니다. 공개 배포 시(향후 F-1) 재검토한다.

### 3.5 태그를 별도 테이블로 분리 (JSON 배열 아님)
- **결정**: `tasks.tags`를 JSON 컬럼으로 두지 않고 `tags` + `task_tags`로 정규화한다.
- **근거**: 태그 필터(FR-504)가 인덱스로 처리되고, 태그 이름 중복 방지(FR-402)와 태그 삭제 시 참조 정리(FR-404)를 DB가 보장한다.
- **대가**: 테이블 2개와 조인이 추가된다. Drizzle 관계 쿼리(`with`)가 단일 SQL로 컴파일해 비용을 흡수한다.

---

## 4. 커넥션 초기화 (필수)

모든 커넥션에서 아래 PRAGMA를 **연결 직후 첫 문장으로** 실행한다 (NFR-201).

```sql
PRAGMA journal_mode = WAL;     -- 다중 읽기 + 단일 쓰기 동시성
PRAGMA synchronous = NORMAL;   -- WAL과 조합 시 안전성/성능 균형
PRAGMA foreign_keys = ON;      -- CASCADE 및 참조 무결성 활성 (기본값 OFF!)
PRAGMA busy_timeout = 5000;    -- 쓰기 락 대기 5초, SQLITE_BUSY 회피
```

**`foreign_keys = ON`은 SQLite에서 커넥션마다 기본 OFF다.** 이 설정을 빠뜨리면 `ON DELETE CASCADE`가 조용히 동작하지 않아 `task_tags`에 고아 행이 쌓인다 (NFR-202 위반).

`journal_mode`는 DB 파일에 영구 기록되지만, 나머지 3개는 커넥션 단위 설정이라 매번 실행해야 한다.

---

## 5. Drizzle 스키마 매핑

`src/lib/server/db/schema.ts` (NFR-501: 반드시 `$lib/server/` 하위)

| DB 컬럼 타입 | Drizzle 정의 | 비고 |
|---|---|---|
| `INTEGER` (PK) | `integer('id').primaryKey({ autoIncrement: true })` | |
| `TEXT` | `text('title').notNull()` | |
| `INTEGER` (시각) | `integer('created_at', { mode: 'timestamp' })` | Unix **초** 저장, JS `Date`로 변환 |
| `INTEGER` (마감일) | `integer('due_date', { mode: 'timestamp' })` | 날짜 자정 값 (§3.3) |
| CHECK 제약 | `sqliteTable(..., (t) => [check(...)])` | 앱 검증(FR-102)과 **이중 방어** |
| UNIQUE NOCASE | `text('name').notNull().unique()` + 마이그레이션 SQL 수정 | drizzle-kit이 `COLLATE NOCASE`를 생성하지 않으면 생성된 SQL에 직접 추가 |
| 복합 PK | `primaryKey({ columns: [t.taskId, t.tagId] })` | |
| FK CASCADE | `.references(() => tasks.id, { onDelete: 'cascade' })` | |

타입은 스키마에서 파생한다 (NFR-602): `typeof tasks.$inferSelect`, `typeof tasks.$inferInsert`. 별도 인터페이스를 수동 정의하지 않는다.

관계 쿼리를 쓰려면 클라이언트 생성 시 스키마를 전달해야 한다: `drizzle(sqlite, { schema })`.

---

## 6. 마이그레이션 정책

| 명령 | 용도 | 운영 사용 |
|---|---|---|
| `db:generate` | 스키마 변경 → SQL 마이그레이션 파일 생성 | ✅ 필수 |
| `db:migrate` | 마이그레이션 파일 적용 | ✅ 필수 |
| `db:push` | 파일 없이 DB 직접 변형 | ❌ **로컬 탐색용 한정** |
| `db:studio` | DB 브라우저 | 개발 편의 |

- 마이그레이션 파일은 저장소에 커밋한다 (FR-603, US-602).
- `drizzle.config.ts`는 SvelteKit 런타임 밖에서 실행되므로 `$env/static/private`가 아니라 `process.env`를 읽는다.
- DB 파일 경로는 `.env`의 `DB_URL`로 주입한다 (FR-602). DB 파일과 `.env`는 `.gitignore`에 넣는다 (NFR-505).

---

## 7. 다중 사용자 전환 시 변경 (향후 F-1)

지금 구현하지 않되, 전환 비용을 미리 기록한다.

1. `users`, `sessions` 테이블 추가 (Better Auth 스키마 기준)
2. `tasks.user_id`, `tags.user_id` FK 추가 (NOT NULL)
3. 기존 행에 소유자를 채우는 데이터 마이그레이션 필요
4. `tags.name` UNIQUE → `UNIQUE(user_id, name COLLATE NOCASE)` 복합 제약으로 변경
5. **모든 조회·수정 쿼리에 소유자 조건 추가** — 누락 시 데이터 유출. 가장 위험한 변경
6. 인덱스에 `user_id` 선행 컬럼 추가

> 5번 때문에 전환은 "테이블 추가"가 아니라 **모든 쿼리 재검토**다. PRD 가정 A1이 흔들릴 가능성이 있다면 지금 F-1을 스코프에 넣는 편이 총비용이 낮다.

---

## 8. 참고 자료

- [Drizzle ORM — SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [SvelteKit with SQLite and Drizzle — Full Stack SvelteKit](https://fullstacksveltekit.com/blog/sveltekit-sqlite-drizzle)
- [Gotchas with SQLite in Production — Anže Pečar](https://blog.pecar.me/sqlite-prod/)
- [How to Set Up SQLite for Production Use — OneUptime](https://oneuptime.com/blog/post/2026-02-02-sqlite-production-setup/view)
- [SQLite WAL Mode and Concurrency — Coddy](https://coddy.tech/docs/sqlite/wal-mode-and-concurrency)
