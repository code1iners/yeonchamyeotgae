import type {
	Adjustment,
	GrantDetail,
	HireDateSplit,
	LeaveEntry,
	Settings,
} from "@yeoncha/core";
import { splitRecordsByHireDate } from "@yeoncha/core";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AdjustmentsSection } from "./AdjustmentsSection";
import { DataSection } from "./DataSection";
import { isValidHireDate } from "./settings-validation";
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
	/** 조정 폼을 연 채로 그릴 것인가. 요약 탭의 `조정을 추가`로 들어온 경로다(5.1절). */
	openAdjustment: boolean;
};

/** 기준방식 선택지(CONTEXT.md) — 코어의 `grantBasis` 값과 화면 문구를 잇는다. */
const GRANT_BASIS_OPTIONS = [
	/** 발생을 입사일에 맞춰 준다. */
	{
		value: "hireDate",
		label: "입사일 기준",
		description:
			"입사일을 기준으로 해마다 연차가 생기고 소멸일도 발생일에 맞춰집니다.",
		example: "첫 연차는 입사 1년 뒤에 생깁니다.",
	},
	/** 발생을 회계연도(1/1)에 맞춰 준다. 첫해는 비례분이 붙는다. */
	{
		value: "fiscalYear",
		label: "회계연도 기준 (1/1)",
		description:
			"매년 1월 1일에 연차가 생기고 첫해는 입사 후 근무 개월 수로 비례 계산됩니다.",
		example:
			"회사에서 연차 발생을 1월 1일에 한꺼번에 계산한다면 이 방식을 고르세요.",
	},
] as const satisfies readonly {
	/** 코어의 기준방식 값. */
	value: Settings["grantBasis"];
	/** 화면에 표시할 기준방식 이름. */
	label: string;
	/** 기준방식이 계산되는 방법. */
	description: string;
	/** 선택을 도울 실제 사례. */
	example: string;
}[];

/** 설정 폼의 입사일 입력 식별자. 오류와 설명을 같은 입력에 연결한다. */
const HIRE_DATE_INPUT_ID = "settings-hire-date";
/** 설정 폼의 기준방식 선택 식별자. 선택지 설명을 연결한다. */
const GRANT_BASIS_INPUT_ID = "settings-grant-basis";
/** 입사일 입력 설명 식별자. */
const HIRE_DATE_HELP_ID = "settings-hire-date-help";
/** 기준방식 선택 설명 식별자. */
const GRANT_BASIS_HELP_ID = "settings-grant-basis-help";
/** 저장 행동의 현재 가능 여부 설명 식별자. */
const SAVE_STATUS_ID = "settings-save-status";
/** 저장 실패 문구 식별자. */
const SAVE_ERROR_ID = "settings-save-error";
/** 입사일 변경 확인 영역 제목 식별자. */
const CHANGE_CONFIRM_TITLE_ID = "settings-change-confirm-title";
/** 입사일 변경 확인 영역 설명 식별자. */
const CHANGE_CONFIRM_DESCRIPTION_ID = "settings-change-confirm-description";

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
	openAdjustment,
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
	/** 입사일이 저장 형식의 실재하는 날짜인가 — 이 값이 저장 버튼 활성 조건이다. */
	const hireDateValid = isValidHireDate(hireDate);
	/** 화면에서 선택한 기준방식의 설명. 저장값과 다른 선택도 즉시 설명한다. */
	const selectedBasis =
		GRANT_BASIS_OPTIONS.find((option) => option.value === grantBasis) ??
		GRANT_BASIS_OPTIONS[0];
	/** 입력이 저장 가능한 상태인가 — 중복 저장과 빈·잘못된 날짜를 함께 막는다. */
	const canSave = hireDateValid && !unchanged && !saving;
	/** 저장 버튼이 비활성일 때 그 이유를 색과 무관하게 말한다. */
	const saveHint = saving
		? "저장 중입니다…"
		: !hireDate
			? "입사일을 입력하면 저장할 수 있습니다."
			: !hireDateValid
				? "입사일은 실제 날짜(YYYY-MM-DD)여야 저장할 수 있습니다."
				: unchanged
					? "변경한 값이 없습니다."
					: pendingSplit
						? "영향받는 기록을 처리한 뒤 설정을 저장합니다."
						: "변경한 설정을 저장할 수 있습니다.";
	/** 입력 오류를 해당 입력과 저장 상태에 함께 연결하는 설명 식별자. */
	const describedBySuffix = error ? ` ${SAVE_ERROR_ID}` : "";
	/** 마지막으로 폼에 반영한 저장값. 셸이 민 상태가 실제로 달라졌는지 가른다. */
	const syncedRef = useRef(settings);
	/** 입사일 변경 확인이 나타났을 때 보조 기술의 읽기 시작점. */
	const confirmationRef = useRef<HTMLElement>(null);

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

	useEffect(
		function focusChangeConfirmationEffect() {
			// 저장 버튼이 사라지는 순간에도 키보드 사용자가 확인 영역을 놓치지 않게 한다.
			if (pendingSplit) {
				confirmationRef.current?.focus();
			}
		},
		[pendingSplit],
	);

	/**
	 * 저장 버튼 핸들러. 커밋 하나로 파일 생성 · 재계산 · 트레이 갱신이 전부 일어난다.
	 *
	 * 입사일을 바꾸는 길에만 한 단계가 더 있다 — 새 입사일 이전의 기록을 지울지
	 * 묻는 것이다(5.4절). 앱이 대신 고르지 않는다.
	 */
	const handleSave = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		// 잘못된 값은 버튼이 비활성이라도 Enter 제출이나 자동화로 들어올 수 있다.
		if (!canSave) {
			return;
		}

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
		if (saving) {
			return;
		}
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
		if (saving) {
			return;
		}
		if (await commit({ settings: { hireDate, grantBasis } })) {
			setPendingSplit(null);
		}
	};

	return (
		<div className="pane">
			<section
				className="settings-section"
				aria-labelledby="settings-basic-title"
				aria-busy={saving}
			>
				<h2 id="settings-basic-title" className="sec-title">
					기본 설정
				</h2>
				<form
					className="settings-form"
					onSubmit={handleSave}
					noValidate
					aria-label="설정 저장"
					aria-busy={saving}
				>
					<div className="field">
						<label htmlFor={HIRE_DATE_INPUT_ID}>입사일</label>
						<input
							id={HIRE_DATE_INPUT_ID}
							type="date"
							value={hireDate}
							disabled={saving}
							required
							aria-invalid={!hireDateValid}
							aria-describedby={`${HIRE_DATE_HELP_ID} ${SAVE_STATUS_ID}${describedBySuffix}`}
							onChange={(event) => {
								setHireDate(event.target.value);
								// 묻던 중에 값을 다시 바꿨나요? 갈라둔 것이 다른 입사일의 결과가 된다.
								setPendingSplit(null);
							}}
						/>
					</div>
					<p id={HIRE_DATE_HELP_ID} className="settings-help">
						연차가 시작되는 근로일을 입력하세요.
					</p>
					<div className="field">
						<label htmlFor={GRANT_BASIS_INPUT_ID}>기준방식</label>
						<select
							id={GRANT_BASIS_INPUT_ID}
							value={grantBasis}
							disabled={saving}
							aria-describedby={`${GRANT_BASIS_HELP_ID} ${SAVE_STATUS_ID}${describedBySuffix}`}
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
					</div>
					<p id={GRANT_BASIS_HELP_ID} className="settings-help">
						{selectedBasis.description} {selectedBasis.example}
					</p>
					<p
						id={SAVE_STATUS_ID}
						className={`settings-status ${saving ? "settings-status-saving" : ""}`}
						role="status"
						aria-live="polite"
					>
						{saveHint}
					</p>
					{error && (
						<p
							id={SAVE_ERROR_ID}
							className="error"
							role="alert"
							aria-live="assertive"
						>
							{error}
						</p>
					)}
					{pendingSplit ? (
						<section
							ref={confirmationRef}
							className="confirm settings-confirm"
							tabIndex={-1}
							aria-live="polite"
							aria-atomic="true"
							aria-labelledby={CHANGE_CONFIRM_TITLE_ID}
							aria-describedby={CHANGE_CONFIRM_DESCRIPTION_ID}
						>
							<h3
								id={CHANGE_CONFIRM_TITLE_ID}
								className="settings-confirm-title"
							>
								입사일 변경 확인
							</h3>
							<p id={CHANGE_CONFIRM_DESCRIPTION_ID}>
								새 입사일 이전의 {describeDropped(pendingSplit)}이 있습니다.
							</p>
							<p className="dim">
								지우면 삭제 직전 상태가 <code>data.json.bak</code>에 백업됩니다.
								남겨두면 이 기록은 그대로 두고 계산에만 새 입사일을 적용합니다.
							</p>
							<div className="cta">
								<button
									type="button"
									className="primary"
									disabled={saving}
									onClick={() => handleSaveDropping(pendingSplit)}
								>
									{saving ? "저장 중…" : "지우고 저장"}
								</button>
								<button
									type="button"
									disabled={saving}
									onClick={handleSaveKeeping}
								>
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
						</section>
					) : (
						<div className="cta">
							<button
								type="submit"
								className="primary"
								disabled={!canSave}
								aria-describedby={SAVE_STATUS_ID}
							>
								{saving ? "저장 중…" : "저장"}
							</button>
						</div>
					)}
				</form>
			</section>
			{settings && (
				/*
				 * 설정 탭은 탭을 옮길 때마다 통째로 다시 서므로 열림이 마운트 시점의 초기
				 * 상태로 정해진다(5.1절). 효과로 여는 것보다 이쪽이 맞다 — 나중에 맞춰야
				 * 할 값이 아니다.
				 */
				<AdjustmentsSection
					openOnMount={openAdjustment}
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
