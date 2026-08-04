<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();

	// 화면설계서 §2: 헤더(앱 이름 + 「할 일」/「태그」 내비게이션)와 본문. 푸터 없음.
	const nav = [
		{ href: '/', label: '할 일' },
		{ href: '/tags', label: '태그' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="wf-shell">
	<header class="wf-header">
		<h1>TODO</h1>
		<nav class="wf-nav" aria-label="주요 메뉴">
			{#each nav as item (item.href)}
				<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>
					{item.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="wf-main">
		{@render children()}
	</main>
</div>
