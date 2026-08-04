import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'tests/e2e',

	// 모든 테스트가 하나의 SQLite 파일을 공유하고 beforeEach에서 초기화한다.
	// 병렬로 돌리면 서로의 데이터를 지우므로 단일 워커로 순차 실행한다.
	fullyParallel: false,
	workers: 1,

	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: '**/no-js.spec.ts'
		},
		{
			// NFR-401 / NFR-402: JS 없이도 CRUD와 필터가 동작해야 한다.
			// 브라우저의 JS를 실제로 끄고 같은 시나리오를 돌린다.
			name: 'no-js',
			use: { ...devices['Desktop Chrome'], javaScriptEnabled: false },
			testMatch: '**/no-js.spec.ts'
		}
	],

	webServer: {
		// 개발 DB를 건드리지 않도록 E2E 전용 DB를 주입한다.
		// $env/dynamic/private를 쓰므로 런타임 환경변수가 .env를 덮어쓴다.
		//
		// 마이그레이션을 이 명령 안에서 먼저 돌린다. globalSetup은 webServer의 준비 검사보다
		// 늦게 실행되어, 빈 DB로 뜬 서버가 500을 반환하고 검사가 타임아웃된다.
		command: `npm run db:migrate && npm run dev -- --port ${PORT} --strictPort`,
		env: { DB_URL: `file:./data/test-e2e.db` },
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
