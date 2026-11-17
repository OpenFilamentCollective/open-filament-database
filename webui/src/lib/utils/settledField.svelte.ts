/**
 * A text field's value as it stands once the contributor has stopped typing.
 *
 * Name hints (stray whitespace, casing) checked on every keystroke flash up mid-word —
 * "Test " is a perfectly normal state on the way to "Test Blue" — and since they sit
 * above the form, each one shoves the whole dialog down. This lags the value while the
 * field has focus, catching up after `delay` ms of no typing, and immediately on blur.
 *
 * `editing` is true while the field has focus, for checks that should wait for blur
 * entirely (a trailing space is only a mistake once the contributor has moved on).
 */
export function useSettledField(getValue: () => string, fieldId: string, delay = 1000) {
	let settled = $state(getValue());
	let editing = $state(false);

	$effect(() => {
		const onFocusIn = (e: FocusEvent) => {
			if ((e.target as HTMLElement | null)?.id === fieldId) editing = true;
		};
		const onFocusOut = (e: FocusEvent) => {
			if ((e.target as HTMLElement | null)?.id !== fieldId) return;
			editing = false;
			settled = getValue();
		};
		document.addEventListener('focusin', onFocusIn);
		document.addEventListener('focusout', onFocusOut);
		return () => {
			document.removeEventListener('focusin', onFocusIn);
			document.removeEventListener('focusout', onFocusOut);
		};
	});

	$effect(() => {
		const value = getValue();
		// Changes made from outside the field (a Fix button, a draft restore) apply at once.
		if (!editing) {
			settled = value;
			return;
		}
		const timer = setTimeout(() => (settled = value), delay);
		return () => clearTimeout(timer);
	});

	return {
		get value() {
			return settled;
		},
		get editing() {
			return editing;
		}
	};
}
