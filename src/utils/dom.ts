/** 优先真实输入控件，避免 Element Plus tabindex=-1 包装层截获错误定位。 */
export function focusFieldControl(wrapper: HTMLElement | null | undefined) {
  const control =
    wrapper?.querySelector<HTMLElement>(
      "input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled])"
    ) ??
    wrapper?.querySelector<HTMLElement>("button:not([disabled]),[tabindex]:not([tabindex='-1'])") ??
    wrapper;
  control?.focus();
}
