import { type ReactNode, useEffect, useId, useRef, useState } from "react";

type Props = {
	/** 물음표 버튼과 tooltip의 접근 가능한 이름. */
	label: string;
	/** 버튼을 눌렀을 때 읽을 설명. */
	children: ReactNode;
	/** 설명에 함께 보여줄 키보드 단축키. */
	shortcut?: string;
};

/** 용어 설명을 여는 물음표 버튼. hover·click·focus 세 경로를 모두 지원한다. */
export function HelpTooltip({ label, children, shortcut }: Props) {
	/** 고유 tooltip 식별자. React의 개발 모드 구분 문자는 DOM id에서 제거한다. */
	const tooltipId = `help-tooltip-${useId().replace(/:/g, "")}`;
	/** tooltip을 감싸는 경계. 바깥 누름·focus 이동을 판단할 때 쓴다. */
	const rootRef = useRef<HTMLSpanElement>(null);
	/** Escape 뒤 포커스를 되돌릴 물음표 버튼. */
	const triggerRef = useRef<HTMLButtonElement>(null);
	/** 설명이 열려 있는가. */
	const [open, setOpen] = useState(false);

	useEffect(
		function manageHelpTooltipEffect() {
			if (!open) {
				return;
			}

			/** tooltip 바깥을 누르면 열린 설명을 닫는다. */
			const handlePointerDown = (event: PointerEvent) => {
				if (!rootRef.current?.contains(event.target as Node)) {
					setOpen(false);
				}
			};
			/** tooltip 바깥으로 focus가 이동하면 설명을 닫는다. */
			const handleFocusIn = (event: FocusEvent) => {
				if (!rootRef.current?.contains(event.target as Node)) {
					setOpen(false);
				}
			};
			/** Escape는 설명을 닫고 설명을 열었던 버튼으로 돌아간다. */
			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key !== "Escape") {
					return;
				}
				event.preventDefault();
				setOpen(false);
				triggerRef.current?.focus();
			};

			document.addEventListener("pointerdown", handlePointerDown);
			document.addEventListener("focusin", handleFocusIn);
			document.addEventListener("keydown", handleKeyDown);
			return () => {
				document.removeEventListener("pointerdown", handlePointerDown);
				document.removeEventListener("focusin", handleFocusIn);
				document.removeEventListener("keydown", handleKeyDown);
			};
		},
		[open],
	);

	return (
		<span
			ref={rootRef}
			className="help-tooltip"
			onPointerEnter={() => setOpen(true)}
			onPointerLeave={() => {
				if (document.activeElement !== triggerRef.current) {
					setOpen(false);
				}
			}}
		>
			<button
				ref={triggerRef}
				className="help-trigger"
				type="button"
				aria-label={label}
				aria-controls={tooltipId}
				aria-describedby={open ? tooltipId : undefined}
				aria-expanded={open}
				onClick={() => setOpen(true)}
				onFocus={() => setOpen(true)}
				onBlur={(event) => {
					if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
						setOpen(false);
					}
				}}
			>
				?
			</button>
			<span
				id={tooltipId}
				className="help-popover"
				role="tooltip"
				hidden={!open}
			>
				<span>{children}</span>
				{shortcut && <kbd>{shortcut}</kbd>}
			</span>
		</span>
	);
}
