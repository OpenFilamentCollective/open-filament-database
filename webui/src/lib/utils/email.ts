/** Whether two email addresses are the same mailbox for our purposes (case and spacing aside). */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}
