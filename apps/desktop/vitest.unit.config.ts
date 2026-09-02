import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// 기본 검증선은 앱 소스 아래의 단위 테스트만 수집한다.
		include: ["src/**/*.{test,spec}.{js,jsx,ts,tsx}"],
	},
});
