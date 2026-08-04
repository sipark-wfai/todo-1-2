import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
	]
});
