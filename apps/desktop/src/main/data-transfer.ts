import { ParseError } from "@yeoncha/core";
import { dialog } from "electron";
import type { TransferResult } from "../shared/ipc";
import { todayInSeoul } from "./clock";
import { exportDataFile, readImportFile } from "./data-file";
import { withPopoverHeld } from "./popover";
import { importData } from "./store";

/**
 * 내보내기 파일의 기본 이름. 기기를 옮길 때 여러 벌이 한 폴더에 쌓이므로 날짜를 붙인다.
 * `data.json` 그대로 두면 받은 폴더에서 무엇의 파일인지 알 수 없다.
 */
function defaultExportName(): string {
	return `yeoncha-${todayInSeoul()}.json`;
}

/**
 * 저장 파일을 사용자가 고른 자리로 내보낸다(23번).
 *
 * 대화상자가 뜨는 동안 팝오버를 붙잡아 둔다 — 그러지 않으면 blur로 닫혀 결과를
 * 보여줄 화면이 사라진다.
 */
export function exportToFile(): Promise<TransferResult> {
	return withPopoverHeld(async () => {
		/** 사용자가 고른 저장 위치. */
		const picked = await dialog.showSaveDialog({
			title: "데이터 내보내기",
			defaultPath: defaultExportName(),
			filters: [{ name: "JSON", extensions: ["json"] }],
		});

		// 그만뒀나요? 취소는 실패가 아니다.
		if (picked.canceled || !picked.filePath) {
			return { status: "canceled" } as const;
		}

		try {
			exportDataFile(picked.filePath);
			return { status: "done", path: picked.filePath } as const;
		} catch (cause) {
			return { status: "failed", message: failureMessage(cause) } as const;
		}
	});
}

/**
 * 고른 파일로 **전체를 교체한다**(23번). 교체 직전에 백업이 남는다(2절).
 *
 * "지금 데이터가 대체됩니다"를 먼저 말하는 것은 화면의 몫이다 — 여기까지 왔다는
 * 것은 사용자가 이미 그것을 보고 눌렀다는 뜻이다.
 */
export function importFromFile(): Promise<TransferResult> {
	return withPopoverHeld(async () => {
		/** 사용자가 고른 가져올 파일. */
		const picked = await dialog.showOpenDialog({
			title: "데이터 가져오기",
			properties: ["openFile"],
			filters: [{ name: "JSON", extensions: ["json"] }],
		});

		/** 고른 파일 경로. 그만뒀으면 없다. */
		const sourcePath = picked.filePaths[0];
		if (picked.canceled || !sourcePath) {
			return { status: "canceled" } as const;
		}

		try {
			// 읽고 판정한 뒤에 교체한다 — 깨진 파일을 고르면 지금 데이터는 그대로다.
			importData(readImportFile(sourcePath));
			return { status: "done", path: sourcePath } as const;
		} catch (cause) {
			return { status: "failed", message: failureMessage(cause) } as const;
		}
	});
}

/**
 * 실패 사유를 화면에 옮길 한 줄로 만든다.
 *
 * 파서의 세 갈래는 사용자가 할 일이 서로 다르다 — 다른 파일을 고르는 것과 앱을
 * 업데이트하는 것은 같은 문구로 안내할 수 없다(2절 표).
 */
function failureMessage(cause: unknown): string {
	if (cause instanceof ParseError) {
		switch (cause.kind) {
			case "invalid-json":
				return "고른 파일이 JSON이 아닙니다";
			case "schema-mismatch":
				return "고른 파일의 구조가 저장 형식과 다릅니다";
			case "future-version":
				return "고른 파일이 더 새 버전입니다 — 앱을 업데이트하세요";
		}
	}
	return cause instanceof Error ? cause.message : String(cause);
}
