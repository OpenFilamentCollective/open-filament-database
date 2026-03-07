/**
 * Message Handler Utility
 *
 * Composable for managing success/error/info messages with auto-dismiss functionality.
 * Uses Svelte 5 runes for reactivity.
 */

export type MessageType = 'success' | 'error' | 'info';

export interface MessageState {
	message: string | null;
	type: MessageType;
}

/**
 * Create a message handler with reactive state
 * @returns Object with message state and methods to show/clear messages
 */
export function createMessageHandler() {
	let message = $state<string | null>(null);
	let type = $state<MessageType>('info');
	let timeoutId: number | null = null;

	/**
	 * Show a success message (auto-dismisses after duration)
	 */
	function showSuccess(msg: string, duration = 3000): void {
		clearTimeout();
		message = msg;
		type = 'success';

		if (duration > 0) {
			timeoutId = window.setTimeout(() => {
				message = null;
			}, duration);
		}
	}

	/**
	 * Show an error message (does not auto-dismiss)
	 */
	function showError(msg: string): void {
		clearTimeout();
		message = msg;
		type = 'error';
	}

	/**
	 * Show an info message (does not auto-dismiss)
	 */
	function showInfo(msg: string): void {
		clearTimeout();
		message = msg;
		type = 'info';
	}

	/**
	 * Clear the current message
	 */
	function clear(): void {
		clearTimeout();
		message = null;
	}

	/**
	 * Clear any pending timeout
	 */
	function clearTimeout(): void {
		if (timeoutId !== null) {
			window.clearTimeout(timeoutId);
			timeoutId = null;
		}
	}

	return {
		get message() {
			return message;
		},
		get type() {
			return type;
		},
		showSuccess,
		showError,
		showInfo,
		clear
	};
}
