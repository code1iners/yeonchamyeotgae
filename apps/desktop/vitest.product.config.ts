import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// 제품 검증선은 명시적으로 실행할 Electron 제품 흐름만 수집한다.
		include: ["e2e/**/*.{test,spec}.{js,jsx,ts,tsx}"],
	},
});
