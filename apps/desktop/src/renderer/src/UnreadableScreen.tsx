import type { ParseErrorKind } from "@yeoncha/core";
import { useState } from "react";
import { failureReason } from "./failure-reason";

type Props = {
	/** 읽기가 실패한 갈래. 무엇을 안내하고 버튼을 띄울지가 이것으로 갈린다(2절 표). */
	kind: ParseErrorKind;
};

/** 갈래별 안내 문구. 사용자가 할 일이 서로 달라 한 문구로 묶지 않는다. */
const MESSAGES: Record<ParseErrorKind, string> = {
	/** JSON 파싱 실패. 파일 권한 등으로 읽지 못한 경우도 여기로 온다. */
	"invalid-json": "파일이 JSON 형식이 아니거나 열 수 없습니다.",
	/** 구조 검증 실패. */
	"schema-mismatch": "파일의 구조가 저장 형식과 다릅니다.",
	/** 앱보다 새 버전이 쓴 파일. */
	"future-version": "더 새 버전의 앱이 쓴 파일입니다. 앱을 업데이트하세요.",
};

/**
 * 읽기 실패 화면 — **탭이 아니라 팝오버 전체를 차지한다**(스펙 5.5절).
 *
 * 탭 3개 구조와 층위가 다르다. 헤더도 탭 막대도 없다 — 잔여를 낼 수 없는 상태이고,
 * 여기서 할 수 있는 일은 고르는 것 하나뿐이다. **고를 때까지 파일에 쓰지 않는다**(2절).
 *
 * **미래 버전에는 버튼을 띄우지 않고 안내만 남긴다**(5.5절). `[백업에서 복구]`가
 * 뜨지 않는 이유는 그 백업도 신버전이 남긴 것이라 되돌려도 같은 화면으로 돌아오기
 * 때문이고, 여기서 사용자가 할 일은 앱을 업데이트하는 것 하나다.
 */
export function UnreadableScreen({ kind }: Props) {
	/** 복구가 오가는 중인가. */
	const [restoring, setRestoring] = useState(false);
	/** 복구 실패 문구. 백업이 없거나 그것마저 깨졌을 때 뜬다. */
	const [error, setError] = useState<string | null>(null);

	/** 백업에서 복구 핸들러. 성공하면 셸이 상태를 밀어주고 이 화면이 사라진다. */
	const handleRestore = async () => {
		setRestoring(true);
		try {
			await window.yeoncha.restoreBackup();
			setError(null);
		} catch (cause) {
			console.error("백업에서 복구하지 못했다", cause);
			setError(`복구하지 못했습니다 — ${failureReason(cause)}`);
		} finally {
			setRestoring(false);
		}
	};

	/** 파일 위치 열기 핸들러. 여는 데 실패해도 이 화면이 할 말은 없으므로 기록만 남긴다. */
	const handleReveal = () => {
		window.yeoncha.revealDataFile().catch((cause: unknown) => {
			console.error("파일 위치를 열지 못했다", cause);
		});
	};

	return (
		<div className="failure">
			<div className="failure-title">저장 파일을 읽지 못했습니다</div>
			<p className="failure-body">{MESSAGES[kind]}</p>
			<p className="failure-body">
				고를 때까지 앱은 이 파일에 쓰지 않습니다. 원본은 그대로 있습니다.
			</p>
			{error && <p className="error">{error}</p>}
			{kind !== "future-version" && (
				<div className="cta">
					<button
						type="button"
						className="primary"
						disabled={restoring}
						onClick={handleRestore}
					>
						백업에서 복구
					</button>
					<button type="button" disabled={restoring} onClick={handleReveal}>
						파일 위치 열기
					</button>
				</div>
			)}
		</div>
	);
}
