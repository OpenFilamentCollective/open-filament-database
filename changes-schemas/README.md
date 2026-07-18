# Open Filament Database - Cloud Mode Local Changes Schemas

This directory contains JSON Schema definitions for the cloud mode local changes storage system.

## Overview

In cloud mode, the Open Filament Database WebUI allows users to browse and edit a remote database without direct filesystem access. All changes are tracked locally in the browser's `localStorage` and can be exported as JSON for submission via pull request.

## Schema Files

### Core Schemas

1. **[change-set.schema.json](./change-set.schema.json)** - Top-level storage structure
   - Stored in: `localStorage['ofd_pending_changes']`
   - Contains: All pending changes and image references
   - Usage: Main structure for tracking all local modifications

2. **[entity-change.schema.json](./entity-change.schema.json)** - Individual change record
   - Represents: A single create, update, or delete operation
   - Contains: Entity identifier, operation type, data, and property changes
   - Usage: Tracks modifications to specific entities

3. **[change-export.schema.json](./change-export.schema.json)** - Export format
   - Usage: Format for downloading changes as JSON file
   - Contains: Metadata, changes array, and embedded base64 images
   - Filename: `ofd-changes-{timestamp}.json`

### Supporting Schemas

4. **[entity-identifier.schema.json](./entity-identifier.schema.json)**
   - Identifies: Specific entities (store, brand, material, filament, variant)
   - Contains: Type, hierarchical path, and ID

5. **[property-change.schema.json](./property-change.schema.json)**
   - Tracks: Individual property modifications within an entity
   - Contains: Property path (dot notation), old/new values, timestamp

6. **[image-reference.schema.json](./image-reference.schema.json)**
   - Metadata: Reference to images stored separately in localStorage
   - Stored in: `localStorage['ofd_image_{imageId}']` (base64 data)
   - Contains: Image ID, entity path, filename, MIME type, storage key

## Storage Architecture

### localStorage Keys

| Key Pattern | Contents | Format |
|-------------|----------|--------|
| `ofd_pending_changes` | All change metadata | JSON (ChangeSet) |
| `ofd_image_{imageId}` | Base64 image data | String |

### Size Limits

- Typical browser localStorage limit: 5-10 MB per origin
- Base64 encoding increases image size by ~33%
- Consider exporting and clearing changes periodically

## Validation

To validate data against these schemas, use a JSON Schema validator like [ajv](https://www.npmjs.com/package/ajv):

```javascript
import Ajv from 'ajv';
import changeSetSchema from './schemas/change-set.schema.json';

const ajv = new Ajv();
const validate = ajv.compile(changeSetSchema);
const valid = validate(data);

if (!valid) {
  console.error(validate.errors);
}
```

## Schema Relationships

```
ChangeSet (Top-level)
├── changes: Record<string, EntityChange>
│   └── EntityChange
│       ├── entity: EntityIdentifier
│       └── propertyChanges: PropertyChange[]
└── images: Record<string, ImageReference>

ChangeExport (Export format)
├── metadata
├── changes: EntityChange[]
└── images: Record<string, embedded image data>
```

## Implementation Files

The TypeScript implementations of these schemas can be found in:

- Type definitions: [`webui/src/lib/types/changes.ts`](../src/lib/types/changes.ts)
- Change tracking logic: [`webui/src/lib/stores/changes.ts`](../src/lib/stores/changes.ts)
- Database service: [`webui/src/lib/services/database.ts`](../src/lib/services/database.ts)
- Image storage: [`webui/src/lib/services/imageStorage.ts`](../src/lib/services/imageStorage.ts)
- UI component: [`webui/src/lib/components/layout/ChangesMenu.svelte`](../src/lib/components/layout/ChangesMenu.svelte)

## Example Usage

### Reading from localStorage

```javascript
const changeSetJSON = localStorage.getItem('ofd_pending_changes');
const changeSet = JSON.parse(changeSetJSON);

// Access a specific change
const change = changeSet.changes['brands/prusament/materials/pla/filaments/pla_basic'];
console.log(change.operation); // 'update'
console.log(change.propertyChanges); // Array of property changes
```

### Exporting Changes

```javascript
import { changeStore } from '$lib/stores/changes';

// Export all changes as JSON
changeStore.exportChanges();
// Downloads: ofd-changes-{timestamp}.json
```

## Version History

- **1.0.0** (2026-01-31): Initial schema definitions

## License

Same as the Open Filament Database project.
