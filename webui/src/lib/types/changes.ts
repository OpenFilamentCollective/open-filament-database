/**
 * Types for tracking changes in cloud mode
 * Changes are stored in localStorage and layered over the base data from the API
 */

export type EntityType = 'store' | 'brand' | 'material' | 'filament' | 'variant';

export type ChangeOperation = 'create' | 'update' | 'delete';

/**
 * Identifies a specific entity in the database
 */
export interface EntityIdentifier {
	type: EntityType;
	/** Path to the entity, e.g., "stores/acme" or "brands/prusament/materials/pla/filaments/pla_basic/variants/red" */
	path: string;
	/** Entity ID */
	id: string;
}

/**
 * Represents a property-level change
 */
export interface PropertyChange {
	/** Property path (dot notation for nested properties, e.g., "ships_from.0" or "name") */
	property: string;
	/** Old value (undefined for new properties) */
	oldValue?: any;
	/** New value (undefined for deleted properties) */
	newValue?: any;
	/** When the change was made */
	timestamp: number;
}

/**
 * Represents a change to an entity
 */
export interface EntityChange {
	/** Entity identifier */
	entity: EntityIdentifier;
	/** Type of operation */
	operation: ChangeOperation;
	/** For 'create': the entire new entity */
	/** For 'update': only the changed properties */
	/** For 'delete': undefined (entity is marked as deleted) */
	data?: any;
	/** For 'update': detailed property-level changes */
	propertyChanges?: PropertyChange[];
	/** When the change was made */
	timestamp: number;
	/** User-friendly description of the change */
	description: string;
}

/**
 * Collection of all pending changes
 */
export interface ChangeSet {
	/** Map of entity path to its change */
	changes: Record<string, EntityChange>;
	/** Image references stored separately */
	images: Record<string, ImageReference>;
	/** Last modified timestamp */
	lastModified: number;
}

/**
 * Reference to an image stored in localStorage
 */
export interface ImageReference {
	/** Unique ID for this image */
	id: string;
	/** Entity path this image belongs to */
	entityPath: string;
	/** Property name (e.g., "logo") */
	property: string;
	/** Original filename */
	filename: string;
	/** MIME type */
	mimeType: string;
	/** Base64-encoded image data (stored in separate localStorage key) */
	storageKey: string;
}

/**
 * Export format for changes
 */
export interface ChangeExport {
	/** Metadata about the export */
	metadata: {
		exportedAt: number;
		version: string;
		changeCount: number;
		imageCount: number;
	};
	/** All changes */
	changes: EntityChange[];
	/** Images with embedded base64 data */
	images: {
		[imageId: string]: {
			filename: string;
			mimeType: string;
			data: string; // base64
		};
	};
}
