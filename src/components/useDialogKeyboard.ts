import { useEffect, useRef, type RefObject } from "react";

/**
 * 弹窗键盘交互 - Escape 关闭 + Tab 焦点困在弹窗内循环。
 *
 * 所有 createPortal 弹窗(crud-modal / creation-backdrop 系)统一接入,
 * 与「点击遮罩关闭」互补,保证纯键盘用户也能进出弹窗。
 * 返回的 ref 挂在弹窗根 <form>/<div> 上,作为焦点 trap 的边界。
 */
export function useDialogKeyboard<T extends HTMLElement>(onClose: () => void): RefObject<T | null> {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") trapFocus(event, dialogRef.current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return dialogRef;
}

function trapFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (!dialog) return;
  const focusable = dialog.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])");
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
