// 개발용 데모 데이터 시드.
//
// SvelteKit 런타임 밖에서 돌기 때문에 $env/static/private를 쓸 수 없어
// process.env와 better-sqlite3를 직접 사용한다. Drizzle을 거치지 않으므로
// 스키마 정의와 중복되지 않도록 INSERT만 한다.
//
// 이미 할 일이 있으면 아무것도 하지 않는다.

import Database from 'better-sqlite3';
import { config } from 'dotenv';

config();

const url = process.env.DB_URL;
if (!url) throw new Error('DB_URL이 설정되지 않았습니다. .env를 확인하세요.');

const db = new Database(url.replace(/^file:/, ''));
db.pragma('foreign_keys = ON');

const existing = db.prepare('select count(*) as n from tasks').get();
if (existing.n > 0) {
	console.log(`할 일이 이미 ${existing.n}건 있습니다. 시드를 건너뜁니다.`);
	process.exit(0);
}

/** 로컬 자정 기준 Unix 초 (docs/ERD.md §3.3) */
function daysFromToday(offset) {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + offset);
	return Math.floor(d.getTime() / 1000);
}

const now = Math.floor(Date.now() / 1000);

const insertTag = db.prepare('insert into tags (name, created_at) values (?, ?)');
const insertTask = db.prepare(
	`insert into tasks (title, description, completed_at, due_date, priority, created_at, updated_at)
	 values (?, ?, ?, ?, ?, ?, ?)`
);
const linkTag = db.prepare('insert into task_tags (task_id, tag_id) values (?, ?)');

db.transaction(() => {
	const tagIds = {};
	for (const name of ['업무', '긴급', '개인', '공부']) {
		tagIds[name] = insertTag.run(name, now).lastInsertRowid;
	}

	const add = (title, priority, dueOffset, tagNames, completedOffset = null) => {
		const taskId = insertTask.run(
			title,
			null,
			completedOffset === null ? null : daysFromToday(completedOffset),
			dueOffset === null ? null : daysFromToday(dueOffset),
			priority,
			now,
			now
		).lastInsertRowid;
		for (const name of tagNames) linkTag.run(taskId, tagIds[name]);
	};

	add('발표자료 초안 작성', 3, -3, ['업무', '긴급']);
	add('병원 예약 전화', 2, 0, ['개인']);
	add('주간 보고서 작성', 3, 1, ['업무']);
	add('책 반납', 1, 5, []);
	add('장바구니 정리', 2, null, ['개인'], -1);
	add('스터디 자료 읽기', 1, -1, ['공부'], -1);
})();

const { n } = db.prepare('select count(*) as n from tasks').get();
console.log(`시드 완료: 할 일 ${n}건, 태그 4건`);
