// SC-01 할 일 목록: FR-101, FR-102, FR-104, FR-107, FR-108, FR-109, FR-202, FR-203, FR-509

import { expect, test } from '@playwright/test';
import { counts, readTask, resetDb, seed } from './helpers';

test.beforeEach(() => resetDb());

const items = (page: import('@playwright/test').Page) => page.locator('.wf-item');
const titles = (page: import('@playwright/test').Page) => page.locator('.wf-item__title');

test.describe('FR-104 목록 조회', () => {
	test('등록된 할 일이 화면에 나온다', async ({ page }) => {
		seed([{ title: '발표자료 초안 작성' }, { title: '병원 예약 전화' }]);
		await page.goto('/');
		await expect(titles(page)).toHaveText(['발표자료 초안 작성', '병원 예약 전화']);
	});

	test('각 항목에 제목·완료 토글·마감일·우선순위·태그가 보인다 (US-102)', async ({ page }) => {
		seed([{ title: '발표자료 초안 작성', priority: 3, dueOffset: 2, tags: ['업무', '긴급'] }]);
		await page.goto('/');

		const row = items(page).first();
		await expect(row.getByRole('link', { name: '발표자료 초안 작성' })).toBeVisible();
		await expect(row.getByRole('button', { name: /완료로 표시/ })).toBeVisible();
		await expect(row).toContainText('높음');
		await expect(row).toContainText('#업무');
		await expect(row).toContainText('#긴급');
	});

	test('마감일이 없으면 "마감일 없음"으로 표시된다', async ({ page }) => {
		seed([{ title: '마감 없는 일', dueOffset: null }]);
		await page.goto('/');
		await expect(items(page).first()).toContainText('마감일 없음');
	});
});

test.describe('FR-509 빈 상태', () => {
	test('할 일이 하나도 없으면 첫 추가를 유도한다', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('등록된 할 일이 없습니다. 첫 할 일을 추가해 보세요.')).toBeVisible();
		await expect(items(page)).toHaveCount(0);
	});

	test('필터 결과가 0건이면 안내와 초기화 링크가 나온다', async ({ page }) => {
		seed([{ title: '미완료 항목' }]);
		await page.goto('/?status=done');
		await expect(page.getByText('조건에 맞는 할 일이 없습니다.')).toBeVisible();
		await page.getByRole('link', { name: '필터 초기화' }).click();
		await expect(titles(page)).toHaveText(['미완료 항목']);
	});
});

test.describe('FR-101 / FR-102 할 일 추가', () => {
	test('제목만 입력해 추가한다', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('할 일 제목').fill('새로 추가한 할 일');
		await page.getByRole('button', { name: '추가' }).click();

		await expect(titles(page)).toHaveText(['새로 추가한 할 일']);
		expect(counts().tasks).toBe(1);
	});

	test('Enter로도 추가된다 (US-101)', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('할 일 제목').fill('엔터로 추가');
		await page.getByLabel('할 일 제목').press('Enter');
		await expect(titles(page)).toHaveText(['엔터로 추가']);
	});

	test('추가 후 입력창이 비워지고 포커스가 유지된다 (US-101 수용 기준 3)', async ({ page }) => {
		await page.goto('/');
		const input = page.getByLabel('할 일 제목');
		await input.fill('포커스 확인');
		await input.press('Enter');

		await expect(titles(page)).toHaveText(['포커스 확인']);
		await expect(input).toHaveValue('');
		await expect(input).toBeFocused();
	});

	test('공백만인 제목은 거부되고 오류가 표시된다', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('할 일 제목').fill('   ');
		await page.getByRole('button', { name: '추가' }).click();

		await expect(page.getByRole('alert')).toContainText('제목을 입력하세요.');
		expect(counts().tasks).toBe(0);
	});

	test('오류 메시지가 입력 필드와 aria-describedby로 연결된다 (NFR-306)', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('할 일 제목').fill('   ');
		await page.getByRole('button', { name: '추가' }).click();

		const input = page.getByLabel('할 일 제목');
		await expect(input).toHaveAttribute('aria-describedby', 'create-error');
		await expect(page.locator('#create-error')).toBeVisible();
	});
});

test.describe('FR-107 완료 토글', () => {
	test('토글하면 완료 상태로 바뀌고 완료 시각이 기록된다', async ({ page }) => {
		const [id] = seed([{ title: '토글 대상' }]);
		await page.goto('/');

		await page.getByRole('button', { name: '토글 대상 완료로 표시' }).click();

		await expect(items(page).first()).toHaveClass(/wf-item--done/);
		await expect(page.getByRole('button', { name: /미완료로 되돌리기/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(readTask(id)!.completed_at).not.toBeNull();
	});

	test('다시 토글하면 미완료로 돌아온다', async ({ page }) => {
		const [id] = seed([{ title: '두 번 토글', completedOffset: -1 }]);
		await page.goto('/');

		await page.getByRole('button', { name: '두 번 토글 미완료로 되돌리기' }).click();

		await expect(items(page).first()).not.toHaveClass(/wf-item--done/);
		expect(readTask(id)!.completed_at).toBeNull();
	});

	test('토글 후에도 필터·정렬 조건이 유지된다 (US-104 수용 기준 3)', async ({ page }) => {
		seed([
			{ title: '업무 할 일', tags: ['업무'], priority: 3 },
			{ title: '개인 할 일', tags: ['개인'] }
		]);
		await page.goto('/?status=open&sort=priority&q=업무');

		await page.getByRole('button', { name: '업무 할 일 완료로 표시' }).click();

		// 미완료 필터라 완료된 항목은 사라지지만 조건 자체는 그대로여야 한다
		await expect(page).toHaveURL(/status=open/);
		await expect(page).toHaveURL(/sort=priority/);
		await expect(page).toHaveURL(/q=%EC%97%85%EB%AC%B4|q=업무/);
		await expect(page.locator('#f-status')).toHaveValue('open');
		await expect(page.locator('#f-sort')).toHaveValue('priority');
	});
});

test.describe('FR-108 / FR-109 삭제', () => {
	test('1차 제출로는 삭제되지 않고 확인 패널이 나온다', async ({ page }) => {
		seed([{ title: '삭제 대상' }]);
		await page.goto('/');

		await items(page).first().getByRole('button', { name: '삭제' }).click();

		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toContainText('삭제 대상');
		await expect(confirm).toContainText('복구할 수 없습니다');
		// 아직 목록에 남아 있다
		await expect(titles(page)).toHaveText(['삭제 대상']);
		expect(counts().tasks).toBe(1);
	});

	test('확인하면 삭제되고 태그 연결도 제거된다', async ({ page }) => {
		seed([{ title: '삭제 대상', tags: ['업무'] }]);
		await page.goto('/');

		await items(page).first().getByRole('button', { name: '삭제' }).click();
		await page.getByRole('button', { name: '삭제 확인' }).click();

		await expect(items(page)).toHaveCount(0);
		// 할 일과 연결은 사라지고 태그는 남는다 (FR-109)
		expect(counts()).toEqual({ tasks: 0, tags: 1, links: 0 });
	});

	test('취소하면 삭제되지 않는다', async ({ page }) => {
		seed([{ title: '취소할 삭제' }]);
		await page.goto('/');

		await items(page).first().getByRole('button', { name: '삭제' }).click();
		await page.getByRole('link', { name: '취소' }).click();

		await expect(page.getByRole('alertdialog')).toHaveCount(0);
		await expect(titles(page)).toHaveText(['취소할 삭제']);
		expect(counts().tasks).toBe(1);
	});
});

test.describe('FR-202 / FR-203 마감 상태 표시', () => {
	test('미완료 + 마감 지남 → [지남] 라벨', async ({ page }) => {
		seed([{ title: '지난 할 일', dueOffset: -3 }]);
		await page.goto('/');
		await expect(items(page).first().locator('.wf-badge')).toHaveText('지남');
	});

	test('미완료 + 오늘 마감 → [오늘] 라벨', async ({ page }) => {
		seed([{ title: '오늘 할 일', dueOffset: 0 }]);
		await page.goto('/');
		await expect(items(page).first().locator('.wf-badge')).toHaveText('오늘');
	});

	test('미래 마감과 완료된 항목에는 라벨이 없다', async ({ page }) => {
		seed([
			{ title: '미래 할 일', dueOffset: 5 },
			{ title: '완료된 지난 일', dueOffset: -5, completedOffset: -1 }
		]);
		await page.goto('/');
		await expect(page.locator('.wf-badge')).toHaveCount(0);
	});

	test('상태를 색이 아니라 텍스트로도 알린다 (NFR-304)', async ({ page }) => {
		seed([{ title: '지난 할 일', dueOffset: -1 }]);
		await page.goto('/');
		// 라벨이 텍스트 노드로 존재해야 한다 — 색상 클래스만으로는 충족되지 않는다
		await expect(items(page).first()).toContainText('지남');
	});
});
