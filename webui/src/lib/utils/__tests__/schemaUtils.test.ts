import { describe, it, expect } from 'vitest';
import {
	formatLabel,
	applyFormattedTitles,
	removeIdFromSchema,
	normalizeSchema,
	normalizeDataForForm,
	resolveExternalReferences,
	createUiSchema,
	prepareSchemaForEdit
} from '../schemaUtils';

describe('Schema Utils', () => {
	describe('formatLabel', () => {
		it('should convert snake_case to Title Case', () => {
			expect(formatLabel('ships_from')).toBe('Ships From');
			expect(formatLabel('store_name')).toBe('Store Name');
		});

		it('should handle single word', () => {
			expect(formatLabel('name')).toBe('Name');
			expect(formatLabel('website')).toBe('Website');
		});

		it('should handle multiple underscores', () => {
			expect(formatLabel('first_middle_last')).toBe('First Middle Last');
		});

		it('should handle empty string', () => {
			expect(formatLabel('')).toBe('');
		});
	});

	describe('applyFormattedTitles', () => {
		it('should add titles to properties without them', () => {
			const schema = {
				properties: {
					store_name: { type: 'string' },
					ships_from: { type: 'array' }
				}
			};

			const result = applyFormattedTitles(schema);

			expect(result.properties.store_name.title).toBe('Store Name');
			expect(result.properties.ships_from.title).toBe('Ships From');
		});

		it('should not overwrite existing titles', () => {
			const schema = {
				properties: {
					store_name: { type: 'string', title: 'Custom Title' }
				}
			};

			const result = applyFormattedTitles(schema);

			expect(result.properties.store_name.title).toBe('Custom Title');
		});

		it('should recurse into nested objects', () => {
			const schema = {
				properties: {
					nested_object: {
						type: 'object',
						properties: {
							inner_field: { type: 'string' }
						}
					}
				}
			};

			const result = applyFormattedTitles(schema);

			expect(result.properties.nested_object.properties.inner_field.title).toBe('Inner Field');
		});

		it('should recurse into array items', () => {
			const schema = {
				properties: {
					items_list: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								item_name: { type: 'string' }
							}
						}
					}
				}
			};

			const result = applyFormattedTitles(schema);

			expect(result.properties.items_list.items.properties.item_name.title).toBe('Item Name');
		});

		it('should deep clone schema', () => {
			const schema = {
				properties: {
					field: { type: 'string' }
				}
			};

			const result = applyFormattedTitles(schema);

			// Original should not be modified
			expect(schema.properties.field).not.toHaveProperty('title');
		});
	});

	describe('removeIdFromSchema', () => {
		it('should remove id property', () => {
			const schema = {
				properties: {
					id: { type: 'string' },
					name: { type: 'string' }
				}
			};

			const result = removeIdFromSchema(schema);

			expect(result.properties).not.toHaveProperty('id');
			expect(result.properties).toHaveProperty('name');
		});

		it('should remove id from required array', () => {
			const schema = {
				properties: {
					id: { type: 'string' },
					name: { type: 'string' }
				},
				required: ['id', 'name']
			};

			const result = removeIdFromSchema(schema);

			expect(result.required).not.toContain('id');
			expect(result.required).toContain('name');
		});

		it('should deep clone schema', () => {
			const schema = {
				properties: {
					id: { type: 'string' },
					name: { type: 'string' }
				}
			};

			const result = removeIdFromSchema(schema);

			// Original should not be modified
			expect(schema.properties).toHaveProperty('id');
		});

		it('should handle schema without id', () => {
			const schema = {
				properties: {
					name: { type: 'string' }
				}
			};

			const result = removeIdFromSchema(schema);

			expect(result.properties).toHaveProperty('name');
		});
	});

	describe('normalizeSchema', () => {
		it('should convert union types to single array type', () => {
			const schema = {
				properties: {
					ships_from: {
						type: ['array', 'string'],
						items: { type: 'string' }
					}
				}
			};

			const result = normalizeSchema(schema);

			expect(result.properties.ships_from.type).toBe('array');
		});

		it('should prefer array when present in union', () => {
			const schema = {
				properties: {
					field: {
						type: ['string', 'array'],
						items: { type: 'string' }
					}
				}
			};

			const result = normalizeSchema(schema);

			expect(result.properties.field.type).toBe('array');
		});

		it('should not modify non-union types', () => {
			const schema = {
				properties: {
					name: { type: 'string' },
					count: { type: 'number' }
				}
			};

			const result = normalizeSchema(schema);

			expect(result.properties.name.type).toBe('string');
			expect(result.properties.count.type).toBe('number');
		});
	});

	describe('normalizeDataForForm', () => {
		it('should convert string to array for array properties', () => {
			const data = { ships_from: 'US' };
			const schema = {
				properties: {
					ships_from: { type: 'array', items: { type: 'string' } }
				}
			};

			const result = normalizeDataForForm(data, schema);

			expect(result.ships_from).toEqual(['US']);
		});

		it('should use empty array for undefined array properties', () => {
			const data = { name: 'Test' };
			const schema = {
				properties: {
					name: { type: 'string' },
					ships_from: { type: 'array' }
				}
			};

			const result = normalizeDataForForm(data, schema);

			expect(result.ships_from).toEqual([]);
		});

		it('should not modify non-array properties', () => {
			const data = { name: 'Test Store' };
			const schema = {
				properties: {
					name: { type: 'string' }
				}
			};

			const result = normalizeDataForForm(data, schema);

			expect(result.name).toBe('Test Store');
		});

		it('should not modify existing arrays', () => {
			const data = { ships_from: ['US', 'CA'] };
			const schema = {
				properties: {
					ships_from: { type: 'array' }
				}
			};

			const result = normalizeDataForForm(data, schema);

			expect(result.ships_from).toEqual(['US', 'CA']);
		});
	});

	describe('resolveExternalReferences', () => {
		it('should inline material_types_schema.json reference', () => {
			const schema = {
				properties: {
					material: {
						$ref: './material_types_schema.json'
					}
				}
			};

			const result = resolveExternalReferences(schema);

			expect(result.properties.material.type).toBe('string');
			expect(result.properties.material.enum).toContain('PLA');
			expect(result.properties.material.enum).toContain('PETG');
			expect(result.properties.material.enum).toContain('ABS');
		});

		it('should recursively process objects', () => {
			const schema = {
				properties: {
					nested: {
						type: 'object',
						properties: {
							material: {
								$ref: './material_types_schema.json'
							}
						}
					}
				}
			};

			const result = resolveExternalReferences(schema);

			expect(result.properties.nested.properties.material.type).toBe('string');
			expect(result.properties.nested.properties.material.enum).toContain('PLA');
		});

		it('should keep other external references', () => {
			const schema = {
				properties: {
					other: {
						$ref: './other_schema.json'
					}
				}
			};

			const result = resolveExternalReferences(schema);

			expect(result.properties.other.$ref).toBe('./other_schema.json');
		});

		it('should keep internal $ref', () => {
			const schema = {
				properties: {
					ref_field: { $ref: '#/$defs/SomeType' }
				}
			};

			const result = resolveExternalReferences(schema);

			expect(result.properties.ref_field.$ref).toBe('#/$defs/SomeType');
		});
	});

	describe('createUiSchema', () => {
		it('should include Tailwind button classes', () => {
			const uiSchema = createUiSchema();

			expect(uiSchema['ui:options'].submitButton.class).toContain('bg-primary');
			expect(uiSchema['ui:options'].button.class).toContain('rounded-md');
		});

		it('should configure submit button styling', () => {
			const uiSchema = createUiSchema();

			expect(uiSchema['ui:options'].submitButton.class).toContain('sjsf-submit-button');
			expect(uiSchema['ui:options'].submitButton.class).toContain('w-full');
		});

		it('should configure array action button styling', () => {
			const uiSchema = createUiSchema();

			expect(uiSchema['ui:options'].buttons['array-item-add'].class).toContain('bg-secondary');
			expect(uiSchema['ui:options'].buttons['array-item-remove'].class).toContain('bg-destructive');
		});
	});

	describe('prepareSchemaForEdit', () => {
		it('should combine all transformations', () => {
			const schema = {
				properties: {
					id: { type: 'string' },
					store_name: { type: 'string' },
					ships_from: { type: ['array', 'string'], items: { type: 'string' } },
					material: { $ref: './material_types_schema.json' }
				},
				required: ['id', 'store_name']
			};

			const result = prepareSchemaForEdit(schema);

			// Should remove id
			expect(result.schema.properties).not.toHaveProperty('id');

			// Should format titles
			expect(result.schema.properties.store_name.title).toBe('Store Name');

			// Should normalize union types
			expect(result.schema.properties.ships_from.type).toBe('array');

			// Should resolve external references
			expect(result.schema.properties.material.type).toBe('string');
			expect(result.schema.properties.material.enum).toContain('PLA');
		});

		it('should return schema and uiSchema', () => {
			const schema = { properties: { name: { type: 'string' } } };

			const result = prepareSchemaForEdit(schema);

			expect(result).toHaveProperty('schema');
			expect(result).toHaveProperty('uiSchema');
			expect(result.uiSchema['ui:options']).toBeDefined();
		});
	});
});
