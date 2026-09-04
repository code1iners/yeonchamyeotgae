import { afterEach, describe, expect, test } from "vitest";
import {
	closeProductFlow,
	expectKeyboardFocus,
	expectVisible,
	launchProductFlow,
	type ProductFlow,
	waitForStoredData,
} from "./product-flow-harness";

/** 온보딩 시나리오가 열어 둔 제품 흐름. */
let flow: ProductFlow | null = null;

afterEach(async () => {
	if (flow) {
		await closeProductFlow(flow);
		flow = null;
	}
});

describe.sequential("Electron 온보딩 제품 흐름", () => {
	test("입사일 전에는 설정만 보이고 저장 뒤 정상 상태를 활성화한다", async () => {
		flow = await launchProductFlow(null);

		await expectVisible(
			flow.page.getByText("입사일을 넣으면 연차를 계산합니다."),
		);
		await expectVisible(flow.page.getByRole("heading", { name: "기본 설정" }));
		/** 온보딩의 첫 입력. 첫 실행에 바로 입력을 시작할 수 있어야 한다. */
		const hireDate = flow.page.getByLabel("입사일");
		await expectKeyboardFocus(hireDate);
		expect(await hireDate.getAttribute("aria-invalid")).toBe("true");
		/** 입사일이 비어 있을 때 저장할 수 없는 상태를 전달하는 버튼. */
		const saveButton = flow.page.getByRole("button", {
			name: "저장",
			exact: true,
		});
		expect(await saveButton.isDisabled()).toBe(true);
		await expectVisible(
			flow.page
				.getByRole("status")
				.filter({ hasText: "입사일을 입력하면 저장할 수 있습니다." }),
		);
		expect(
			await flow.page.getByRole("region", { name: "데이터" }).count(),
		).toBe(0);
		expect(
			await flow.page.getByRole("button", { name: "데이터 가져오기" }).count(),
		).toBe(0);
		expect(
			await flow.page.getByRole("button", { name: "단축키 도움말" }).count(),
		).toBe(0);
		expect(
			await flow.page.getByRole("tab", { name: "요약" }).isDisabled(),
		).toBe(true);
		expect(
			await flow.page.getByRole("tab", { name: "이력" }).isDisabled(),
		).toBe(true);

		// 첫 설정을 저장하면 현재 설정 맥락을 유지한 채 계산 가능한 상태가 된다.
		await hireDate.fill("2020-01-01");
		await expectVisible(
			flow.page
				.getByRole("status")
				.filter({ hasText: "변경한 설정을 저장할 수 있습니다." }),
		);
		await saveButton.focus();
		await saveButton.press("Enter");
		await expectVisible(flow.page.getByText("잔여", { exact: true }).first());
		expect(
			await flow.page
				.getByRole("tab", { name: "설정" })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(await flow.page.getByRole("tab", { name: "요약" }).isEnabled()).toBe(
			true,
		);
		expect(await flow.page.getByRole("tab", { name: "이력" }).isEnabled()).toBe(
			true,
		);
		await expectVisible(flow.page.getByRole("region", { name: "데이터" }));
		/** 첫 설정 저장 뒤 키보드로 돌아갈 요약 탭. */
		const summaryTab = flow.page.getByRole("tab", { name: "요약" });
		await summaryTab.focus();
		await summaryTab.press("Enter");
		await expectVisible(flow.page.getByRole("button", { name: "휴가 등록" }));
		/** 첫 설정 저장 뒤 실제 파일에 남은 데이터. */
		const stored = await waitForStoredData(
			flow.userDataDirectory,
			(data) => data.settings.hireDate === "2020-01-01",
		);
		expect(stored.entries).toHaveLength(0);
	});
});
