import type {
	Adjustment,
	GrantDetail,
	HireDateSplit,
	LeaveEntry,
	Settings,
} from "@yeoncha/core";
import { splitRecordsByHireDate } from "@yeoncha/core";
import { useEffect, useRef, useState } from "react";
import { AdjustmentsSection } from "./AdjustmentsSection";
import { DataSection } from "./DataSection";
import { useCommit } from "./use-commit";

type Props = {
	/** 저장된 설정. 파일이 아직 없으면 `null`이고 그것이 곧 온보딩이다. */
	settings: Settings | null;
	/** 저장된 휴가 기록. 입사일을 바꿀 때 지울 후보를 가리는 데 쓴다(5.4절). */
	entries: LeaveEntry[];
	/** 저장된 조정 레코드. */
	adjustments: Adjustment[];
	/** 조회일 기준 발생 레코드별 내역. 조정 소멸일의 기본값이 여기서 나온다. */
	grants: GrantDetail[];
	/** 조회일. */
	today: string;
};

/** 기준방식 선택지(CONTEXT.md) — 코어의 `grantBasis` 값과 화면 문구를 잇는다. */
const GRANT_BASIS_OPTIONS = [
	/** 발생을 입사일에 맞춰 준다. */
	{ value: "hireDate", label: "입사일 기준" },
	/** 발생을 회계연도(1/1)에 맞춰 준다. 첫해는 비례분이 붙는다. */
	{ value: "fiscalYear", label: "회계연도 기준 (1/1)" },
] as const satisfies readonly {
	value: Settings["grantBasis"];
	label: string;
}[];

/**
 * 설정 탭 — 입사일 · 기준방식 · 조정 · 데이터(5.4절). 온보딩의 입구이자 앱에
 * 파일이 생기는 유일한 자리다.
 *
 * 입사일이 없으면 조정 섹션 자체가 보이지 않는다 — 입사일도 없는데 조정을 넣을
 * 이유가 없다(5.4절). **데이터 섹션은 그때도 보인다** — 새 기기에서 가져오는 것이
 * 바로 그 시점의 일이다(23번).
 */
export function SettingsTab({
	settings,
	entries,
	adjustments,
	grants,
	today,
}: Props) {
	/** 입력 중인 입사일. 저장하기 전까지는 파일에 없다. */
	const [hireDate, setHireDate] = useState(settings?.hireDate ?? "");
	/** 입력 중인 기준방식. 고르지 않았으면 입사일 기준이다. */
	const [grantBasis, setGrantBasis] = useState<Settings["grantBasis"]>(
		settings?.grantBasis ?? "hireDate",
	);
	/** 새 입사일로 갈라둔 기록. `null`이 아니면 지울지 묻는 중이다(5.4절). */
	const [pendingSplit, setPendingSplit] = useState<HireDateSplit | null>(null);
	/** 셸에 변경을 커밋하는 통로 — 진행 중 잠금과 실패 문구가 함께 온다. */
	const { commit, dropBeforeHireDate, saving, error } = useCommit();

	/** 폼이 저장된 값과 같은가 — 같으면 저장할 것이 없다. */
	const unchanged =
		settings !== null &&
		settings.hireDate === hireDate &&
		settings.grantBasis === grantBasis;
	/** 마지막으로 폼에 반영한 저장값. 셸이 민 상태가 실제로 달라졌는지 가른다. */
	const syncedRef = useRef(settings);

	useEffect(
		function syncSavedSettingsEffect() {
			// 저장값이 그대로인가요? 셸은 자정·절전 복귀에도 상태를 밀어주므로(21번),
			// 값이 같은 푸시에 폼을 다시 채우면 입력 중이던 것이 되돌아간다.
			if (!settings || isSameSettings(settings, syncedRef.current)) {
				return;
			}
			syncedRef.current = settings;
			setHireDate(settings.hireDate);
			setGrantBasis(settings.grantBasis);
		},
		[settings],
	);

	/**
	 * 저장 버튼 핸들러. 커밋 하나로 파일 생성 · 재계산 · 트레이 갱신이 전부 일어난다.
	 *
	 * 입사일을 바꾸는 길에만 한 단계가 더 있다 — 새 입사일 이전의 기록을 지울지
	 * 묻는 것이다(5.4절). 앱이 대신 고르지 않는다.
	 */
	const handleSave = async () => {
		// 입사일이 바뀌었나요? 이직이며, 이전 기록이 있으면 지울지부터 묻는다.
		if (settings && settings.hireDate !== hireDate) {
			/** 새 입사일로 가른 기록. */
			const split = splitRecordsByHireDate({ hireDate, entries, adjustments });
			if (droppedCount(split) > 0) {
				setPendingSplit(split);
				return;
			}
		}
		await commit({ settings: { hireDate, grantBasis } });
	};

	/**
	 * 이전 기록을 지우고 저장한다. **삭제 직전에 백업이 남는다**(2절).
	 *
	 * 남긴 쪽(`남기고 저장`)은 그냥 설정만 커밋한다 — 파서가 입사일 이전 휴가 기록을
	 * 거부하지 않으므로 그 파일을 앱이 그대로 읽는다(2절).
	 */
	const handleSaveDropping = async (split: HireDateSplit) => {
		if (
			await dropBeforeHireDate({
				settings: { hireDate, grantBasis },
				entries: split.kept.entries,
				adjustments: split.kept.adjustments,
			})
		) {
			setPendingSplit(null);
		}
	};

	/** 이전 기록을 남기고 저장한다. */
	const handleSaveKeeping = async () => {
		if (await commit({ settings: { hireDate, grantBasis } })) {
			setPendingSplit(null);
		}
	};

	return (
		<div className="pane">
			<label className="field">
				<span>입사일</span>
				<input
					type="date"
					value={hireDate}
					onChange={(event) => {
						setHireDate(event.target.value);
						// 묻던 중에 값을 다시 바꿨나요? 갈라둔 것이 다른 입사일의 결과가 된다.
						setPendingSplit(null);
					}}
				/>
			</label>
			<label className="field">
				<span>기준방식</span>
				<select
					value={grantBasis}
					onChange={(event) => {
						/** 고른 선택지. 목록에 없는 값은 무시한다. */
						const picked = GRANT_BASIS_OPTIONS.find(
							(option) => option.value === event.target.value,
						);
						if (picked) {
							setGrantBasis(picked.value);
						}
					}}
				>
					{GRANT_BASIS_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			{error && <p className="error">{error}</p>}
			{pendingSplit ? (
				<div className="confirm">
					<p>새 입사일 이전의 {describeDropped(pendingSplit)}이 있습니다.</p>
					<p className="dim">
						지우면 삭제 직전 상태가 <code>data.json.bak</code>에 백업됩니다.
						남겨두면 기록은 그대로 있고 계산에는 새 입사일이 적용됩니다.
					</p>
					<div className="cta">
						<button
							type="button"
							className="primary"
							disabled={saving}
							onClick={() => handleSaveDropping(pendingSplit)}
						>
							지우고 저장
						</button>
						<button type="button" disabled={saving} onClick={handleSaveKeeping}>
							남기고 저장
						</button>
						<button
							type="button"
							disabled={saving}
							onClick={() => setPendingSplit(null)}
						>
							취소
						</button>
					</div>
				</div>
			) : (
				<div className="cta">
					<button
						type="button"
						className="primary"
						disabled={!hireDate || saving || unchanged}
						onClick={handleSave}
					>
						저장
					</button>
				</div>
			)}
			{settings && (
				<AdjustmentsSection
					adjustments={adjustments}
					grants={grants}
					today={today}
				/>
			)}
			<DataSection hasSavedFile={settings !== null} />
		</div>
	);
}

/** 지울 후보의 건수. 묻는 질문 자체가 이 수가 0보다 클 때만 성립한다. */
function droppedCount(split: HireDateSplit): number {
	return split.dropped.entries.length + split.dropped.adjustments.length;
}

/** 지울 후보를 세어 한 줄로 만든다. 없는 쪽은 말하지 않는다 — `조정 0건`은 질문을 흐린다. */
function describeDropped(split: HireDateSplit): string {
	/** 종류별 문구. */
	const parts: string[] = [];
	if (split.dropped.entries.length > 0) {
		parts.push(`휴가 기록 ${split.dropped.entries.length}건`);
	}
	if (split.dropped.adjustments.length > 0) {
		parts.push(`조정 ${split.dropped.adjustments.length}건`);
	}
	return parts.join("과 ");
}

/** 두 설정이 같은 값인가. 셸이 매번 새 객체를 보내므로 참조 비교로는 알 수 없다. */
function isSameSettings(a: Settings | null, b: Settings | null): boolean {
	return a?.hireDate === b?.hireDate && a?.grantBasis === b?.grantBasis;
}
