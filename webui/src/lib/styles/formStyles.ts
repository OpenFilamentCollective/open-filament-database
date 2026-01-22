/**
 * Shared form styling constants
 * These are extracted from the common patterns across TextField, NumberField, SelectField, and form components
 */

// ============================================================================
// INPUT STYLING
// ============================================================================

/** Standard full-size input (TextField, NumberField, SelectField) */
export const INPUT_CLASSES =
	'w-full px-3 py-2 bg-background text-foreground border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-colors';

/** Compact input for nested forms (VariantForm size cards) */
export const INPUT_COMPACT_CLASSES =
	'w-full px-2 py-1 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring';

/** Extra small input (purchase links in VariantForm) */
export const INPUT_XS_CLASSES =
	'w-full px-2 py-1 text-xs bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring';

// ============================================================================
// BUTTON STYLING
// ============================================================================

/** Primary action button */
export const BTN_PRIMARY =
	'px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium transition-colors';

/** Secondary action button */
export const BTN_SECONDARY =
	'px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium transition-colors';

/** Destructive/delete button */
export const BTN_DESTRUCTIVE =
	'px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md font-medium';

/** Full-width submit button (forms) */
export const BTN_SUBMIT =
	'w-full px-6 py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed';

/** Small button (tags, add links) */
export const BTN_SMALL = 'text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80';

/** Pill button (traits, tags) */
export const BTN_PILL =
	'inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-full text-xs hover:bg-primary/90 transition-colors';

/** Dashed add button (add trait) */
export const BTN_DASHED =
	'inline-flex items-center gap-1 px-2 py-1 border border-dashed border-border text-muted-foreground rounded-full text-xs hover:border-primary hover:text-primary transition-colors';

/** Small primary button for inline actions */
export const BTN_PRIMARY_SM =
	'text-sm px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors';

/** Secondary button for form actions */
export const BTN_SECONDARY_LG = 'px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80';

// ============================================================================
// LABEL STYLING
// ============================================================================

/** Standard label */
export const LABEL_CLASSES = 'flex items-center text-sm font-medium text-foreground mb-1';

/** Compact label (nested forms) */
export const LABEL_COMPACT_CLASSES = 'text-xs text-muted-foreground';

/** Required indicator span */
export const REQUIRED_INDICATOR = 'text-destructive ml-1';

// ============================================================================
// LAYOUT STYLING
// ============================================================================

/** Card container styling */
export const CARD_CLASSES = 'border border-border rounded-lg p-3';

/** Card header with colored dot */
export const CARD_HEADER_CLASSES = 'font-medium text-foreground mb-2 flex items-center gap-2 text-sm';

/** Colored dot indicator */
export const DOT_INDICATOR = 'w-2 h-2 rounded-full bg-primary flex-shrink-0';

/** Section divider with top border */
export const SECTION_DIVIDER = 'border-t pt-4 mt-2';

/** Section title */
export const SECTION_TITLE = 'flex items-center text-sm font-medium text-foreground mb-3';
