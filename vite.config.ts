import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
// vitest/config의 defineConfig를 써야 test 옵션이 타입에 포함된다.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node: 로컬 SQLite 파일에 접근하는 서버가 필요하므로 서버리스 대상인
			// adapter-auto를 쓰지 않는다. (PRD §8 기술 결정)
			adapter: adapter()
		})
	],

	test: {
		// 단위·통합 테스트만. E2E는 Playwright가 별도로 돌린다.
		include: ['tests/unit/**/*.test.ts'],
		setupFiles: ['tests/unit/setup.ts'],
		// store.ts는 하나의 SQLite 파일을 공유하는 싱글턴 커넥션을 쓴다.
		// 파일을 병렬로 쓰면 테스트가 서로를 덮으므로 순차 실행한다.
		fileParallelism: false
	}
});
