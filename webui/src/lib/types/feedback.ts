/**
 * Review feedback and revision types shared by the server (src/lib/server/feedback.ts,
 * prChanges.ts, revision.ts) and the browser (the /submissions page, the editor banners).
 */

export type PrKind = 'bot' | 'fork' | 'other';

export interface FeedbackLocation {
	repoPath: string;
	line: number | null;
	/** Editor entity path, or null when the file isn't an entity file. */
	entityPath: string | null;
	entityType: string | null;
	/** JSON pointer inside the entity's editor data (`/sizes/0/purchase_links/1/url`), when known. */
	pointer: string | null;
	/** Human-readable form of `pointer`, e.g. `sizes › 1 › purchase links › 2 › url`. */
	label: string | null;
}

export interface FeedbackItem {
	id: string;
	kind: 'comment' | 'review' | 'inline';
	source: 'ai' | 'maintainer';
	author: string;
	/** Display text: Markdown-ish plain text with suggestion blocks spelled out. */
	body: string;
	url: string;
	createdAt: string;
	/** The line the comment was on has changed since it was written. */
	outdated: boolean;
	/** For a reply: who and what it replies to. */
	context?: { author: string; excerpt: string };
	location?: FeedbackLocation;
}

export interface RejectComment {
	author: string;
	/** The text after "Reject…", sent to the contributor as the reason. */
	reason: string;
	createdAt: string;
	url: string;
}

export interface PrSummary {
	number: number;
	title: string;
	url: string;
	state: 'open' | 'closed';
	merged: boolean;
	author: string;
	authorIsBot: boolean;
	headRef: string;
	headSha: string;
	headOwner: string | null;
	headRepo: string | null;
	maintainerCanModify: boolean;
	kind: PrKind;
	updatedAt: string;
	closedAt: string | null;
}

export interface PrFeedback {
	pr: PrSummary;
	items: FeedbackItem[];
	rejectComment: RejectComment | null;
	/** Some listing hit GitHub's page size, so older items may be missing. */
	truncated: boolean;
}

/** Where a submission stands, as the contributor sees it. */
export type SubmissionStatus = 'open' | 'feedback' | 'merged' | 'returned' | 'rejected' | 'closed';

/** The visitor's permission to revise a PR (the browser-safe part of the server's check). */
export interface ReviseAccessInfo {
	allowed: boolean;
	as?: 'submitter' | 'maintainer';
	via?: 'bot' | 'user-token';
	/** `amend`: push onto the open PR. `resubmit`: open a new PR replacing a returned one. */
	mode?: 'amend' | 'resubmit';
	reason?: string;
	signIn?: 'github' | 'simplyprint';
	kind: PrKind;
	login?: string;
	isMaintainer: boolean;
}

/** GET /api/submissions/[pr] */
export interface SubmissionFeedbackResponse {
	pr: PrSummary;
	status: SubmissionStatus;
	outcome: {
		outcome: 'open' | 'returned' | 'rejected' | 'closed';
		reason?: string;
		supersededBy?: number;
		closedAt: string | null;
	} | null;
	items: FeedbackItem[];
	truncated: boolean;
	access: ReviseAccessInfo;
	/** Served from a development snapshot (/api/dev/preview/<pr>), not GitHub. */
	preview?: boolean;
}

/** One entity of a PR, rebuilt for the editor (GET /api/submissions/[pr]/changes). */
export interface LoadedChange {
	entity: {
		type: 'store' | 'brand' | 'material' | 'filament' | 'variant';
		path: string;
		id: string;
	};
	operation: 'create' | 'update' | 'delete';
	/** The PR's version rebased onto main; null for a delete. */
	data: any | null;
	/** The entity as it is on main now; null for a create. */
	originalData: any | null;
}

export interface LoadedImage {
	entityPath: string;
	filename: string;
	mimeType: string;
	/** base64 */
	data: string;
}

/** GET /api/submissions/[pr]/changes */
export interface PrChangesResponse {
	prNumber: number;
	headSha: string;
	mergeBaseSha: string;
	mainSha: string;
	kind: PrKind;
	changes: LoadedChange[];
	images: LoadedImage[];
	conflicts: { entityPath: string; pointer: string }[];
	otherFiles: string[];
	title: string;
	url: string;
	uuid: string | null;
	feedback: FeedbackItem[];
	access: ReviseAccessInfo;
	/** Served from a development snapshot (/api/dev/preview/<pr>): it can be loaded but not submitted. */
	preview?: boolean;
}

/** A row of the maintainer PR picker (GET /api/review/prs). */
export interface PickerRow {
	number: number;
	title: string;
	url: string;
	author: string;
	kind: PrKind;
	state: 'open' | 'returned';
	updatedAt: string;
	feedbackCount: number | null;
	pushable: boolean;
	/** Why a fix can't be pushed, when `pushable` is false. */
	pushReason?: string;
}
