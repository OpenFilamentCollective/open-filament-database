/**
 * Shared form styling constants - Standard shadcn patterns
 */

// ============================================================================
// INPUT STYLING
// ============================================================================

/** Standard input */
export const INPUT_CLASSES =
	'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Compact input for nested forms */
export const INPUT_COMPACT_CLASSES =
	'flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

/** Extra small input */
export const INPUT_XS_CLASSES =
	'flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

// ============================================================================
// BUTTON STYLING - Standard shadcn
// ============================================================================

/** Primary action button */
export const BTN_PRIMARY =
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2';

/** Secondary action button */
export const BTN_SECONDARY =
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2';

/** Destructive/delete button */
export const BTN_DESTRUCTIVE =
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2';

/** Full-width submit button (forms) */
export const BTN_SUBMIT =
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 w-full h-10 px-4 py-2';

/** Small button */
export const BTN_SMALL =
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-8 px-3';

/** Pill button (traits, tags) */
export const BTN_PILL =
	'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors';

/** Dashed add button */
export const BTN_DASHED =
	'inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-input text-muted-foreground rounded-md text-xs hover:border-foreground hover:text-foreground transition-colors';

/** Small primary button for inline actions */
export const BTN_PRIMARY_SM =
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3';

/** Secondary button for form actions */
export const BTN_SECONDARY_LG =
	'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-11 px-8';

// ============================================================================
// LABEL STYLING
// ============================================================================

/** Standard label */
export const LABEL_CLASSES = 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';

/** Compact label (nested forms) */
export const LABEL_COMPACT_CLASSES = 'text-xs text-muted-foreground';

/** Required indicator span */
export const REQUIRED_INDICATOR = 'text-destructive ml-1';

// ============================================================================
// LAYOUT STYLING - Standard shadcn Card patterns
// ============================================================================

/** Card container styling */
export const CARD_CLASSES = 'rounded-lg border bg-card text-card-foreground shadow-sm p-4';

/** Card header */
export const CARD_HEADER_CLASSES = 'font-semibold leading-none tracking-tight mb-2';

/** Colored dot indicator */
export const DOT_INDICATOR = 'w-2 h-2 rounded-full bg-primary flex-shrink-0';

/** Section divider with top border */
export const SECTION_DIVIDER = 'border-t pt-4 mt-4';

/** Section title */
export const SECTION_TITLE = 'text-sm font-medium mb-3';
