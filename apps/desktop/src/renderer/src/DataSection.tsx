import { useState } from "react";
import type { TransferResult } from "../../shared/ipc";

type Props = {
	/** 저장 파일이 이미 있는가. 없으면 온보딩이며 내보낼 것도 열어볼 것도 없다. */
	hasSavedFile: boolean;
};

/**
 * 설정 탭의 데이터 섹션 — 파일 위치 열기 · 내보내기 · 가져오기(스펙 5.4절).
 *
 * **내보내기 파일 = 저장 파일이다**(2절). 그래서 이 셋은 한 파일을 두고 하는 일이며,
 * 내보낸 것을 그대로 다시 가져올 수 있다.
 *
 * **온보딩에는 가져오기 하나만 남긴다.** 그 시점에 저장 파일이 없어 나머지 둘은
 * 누르면 실패하고, 온보딩이 말해야 하는 것은 한 줄뿐이다(5.4절). 가져오기만 남기는
 * 것은 그것이 새 기기에서 처음부터 넣지 않는 유일한 경로이기 때문이다(사용자 스토리 45).
 */
export function DataSection({ hasSavedFile }: Props) {
	/** 가져오기 확인을 띄우고 있는가. 전체 교체이므로 한 단계를 더 둔다. */
	const [confirming, setConfirming] = useState(false);
	/** 대화상자가 오가는 중인가. 같은 조작을 두 번 보내지 않게 막는다. */
	const [busy, setBusy] = useState(false);
	/** 마지막 성공 안내. */
	const [notice, setNotice] = useState<string | null>(null);
	/** 마지막 실패 문구. */
	const [error, setError] = useState<string | null>(null);

	/** 내보내기·가져오기 결과를 화면 문구로 옮긴다. 취소는 아무 말도 하지 않는다. */
	const report = (result: TransferResult, doneMessage: string) => {
		setNotice(
			result.status === "done" ? `${doneMessage} — ${result.path}` : null,
		);
		setError(result.status === "failed" ? result.message : null);
	};

	/** 대화상자를 여는 조작 하나를 감싼다 — 진행 중 잠금이 두 버튼에 같이 걸린다. */
	const run = async (
		open: () => Promise<TransferResult>,
		doneMessage: string,
	) => {
		setBusy(true);
		try {
			report(await open(), doneMessage);
		} catch (cause) {
			console.error("데이터 조작에 실패했다", cause);
			setError("데이터 조작에 실패했습니다");
		} finally {
			setBusy(false);
		}
	};

	/** 파일 위치 열기 핸들러. 여는 데 실패해도 화면이 할 말은 없으므로 기록만 남긴다. */
	const handleReveal = () => {
		window.yeoncha.revealDataFile().catch((cause: unknown) => {
			console.error("파일 위치를 열지 못했다", cause);
		});
	};

	/** 가져오기 확인 핸들러. 여기서부터 지금 데이터가 대체된다. */
	const handleImport = async () => {
		setConfirming(false);
		await run(() => window.yeoncha.importData(), "가져왔습니다");
	};

	/** 가져오기 확인을 여는 핸들러. 남아 있던 지난 결과 문구를 먼저 걷어낸다. */
	const handleOpenConfirm = () => {
		setNotice(null);
		setError(null);
		setConfirming(true);
	};

	return (
		<>
			{hasSavedFile && (
				<>
					<div className="sec-title">데이터</div>
					<div className="row dim">
						내보낸 파일이 곧 저장 파일입니다. 그 파일을 그대로 가져올 수
						있습니다.
					</div>
				</>
			)}
			{notice && <p className="notice">{notice}</p>}
			{error && <p className="error">{error}</p>}
			{confirming ? (
				<div className="confirm">
					<p>지금 데이터가 대체됩니다.</p>
					<p className="dim">
						가져오기는 전체 교체입니다. 지금 휴가 기록과 조정은 남지 않으며,
						교체 직전 상태는 <code>data.json.bak</code>에 백업됩니다.
					</p>
					<div className="cta">
						<button
							type="button"
							className="primary"
							disabled={busy}
							onClick={handleImport}
						>
							파일 고르고 대체
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => setConfirming(false)}
						>
							취소
						</button>
					</div>
				</div>
			) : (
				<div className="cta">
					{hasSavedFile && (
						<>
							<button type="button" disabled={busy} onClick={handleReveal}>
								파일 위치 열기
							</button>
							<button
								type="button"
								disabled={busy}
								onClick={() =>
									run(() => window.yeoncha.exportData(), "내보냈습니다")
								}
							>
								내보내기
							</button>
						</>
					)}
					<button type="button" disabled={busy} onClick={handleOpenConfirm}>
						{hasSavedFile ? "가져오기" : "데이터 가져오기"}
					</button>
				</div>
			)}
		</>
	);
}
