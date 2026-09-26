<script lang="ts">
import obzorarrIcon from '$lib/assets/obzorarr-icon.svg';

interface Props {
	size?: 'sm' | 'md' | 'lg' | 'xl' | number;
	class?: string;
}

let { size = 'md', class: klass = '' }: Props = $props();

const sizeMap = { sm: 32, md: 48, lg: 64, xl: 96 };
const pixelSize = $derived(typeof size === 'number' ? size : sizeMap[size]);
</script>

<img
	src={obzorarrIcon}
	alt=""
	aria-hidden="true"
	width={pixelSize}
	height={pixelSize}
	class="logo {klass}"
>

<style>
.logo {
	display: inline-block;
	vertical-align: middle;
	flex-shrink: 0;
}
</style>
