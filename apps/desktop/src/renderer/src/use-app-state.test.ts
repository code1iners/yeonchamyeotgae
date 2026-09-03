import { describe, expect, test } from "vitest";
import { shouldAcceptInitialState } from "./use-app-state";

describe("초기 상태 요청 경계", () => {
	test("상태 push가 먼저 오면 늦은 getState 결과를 버린다", () => {
		expect(
			shouldAcceptInitialState({
				requestId: 1,
				currentRequestId: 2,
				pushVersionAtStart: 0,
				currentPushVersion: 1,
			}),
		).toBe(false);
	});

	test("같은 요청 세대의 결과만 받아들인다", () => {
		expect(
			shouldAcceptInitialState({
				requestId: 3,
				currentRequestId: 3,
				pushVersionAtStart: 1,
				currentPushVersion: 1,
			}),
		).toBe(true);
	});
});
