#!/usr/bin/env node

/**
 * Script to generate TypeScript types from JSON schemas
 * Usage: node scripts/generate-types.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');
const schemasDir = join(rootDir, 'schemas');
const outputFile = join(__dirname, '../src/lib/types/database.ts');

/**
 * Convert a JSON schema property to a TypeScript type
 */
function schemaTypeToTS(prop, depth = 0) {
	if (!prop || depth > 20) return 'any';

	// Handle union types (e.g., ["array", "string"])
	if (Array.isArray(prop.type)) {
		const types = prop.type.map((t) => {
			if (t === 'array' && prop.items) {
				return `${schemaTypeToTS(prop.items, depth + 1)}[]`;
			}
			return basicTypeToTS(t);
		});
		return types.join(' | ');
	}

	// Handle single types
	if (prop.type === 'array' && prop.items) {
		return `${schemaTypeToTS(prop.items, depth + 1)}[]`;
	}

	if (prop.type === 'object') {
		if (prop.properties) {
			const props = Object.entries(prop.properties)
				.map(([key, value]) => {
					const isRequired = prop.required && prop.required.includes(key);
					const optional = isRequired ? '' : '?';
					return `${key}${optional}: ${schemaTypeToTS(value, depth + 1)}`;
				})
				.join(';\n\t');
			return `{\n\t${props}\n}`;
		}
		return 'Record<string, any>';
	}

	return basicTypeToTS(prop.type);
}

function basicTypeToTS(type) {
	switch (type) {
		case 'string':
			return 'string';
		case 'number':
		case 'integer':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'null':
			return 'null';
		default:
			return 'any';
	}
}

/**
 * Generate TypeScript interface from JSON schema
 */
function generateInterface(schemaName, schema) {
	if (!schema.properties) {
		return `export interface ${schemaName} {\n\t[key: string]: any;\n}\n`;
	}

	const props = Object.entries(schema.properties)
		.map(([key, value]) => {
			const isRequired = schema.required && schema.required.includes(key);
			const optional = isRequired ? '' : '?';
			const description = value.description ? `\n\t/** ${value.description} */` : '';
			return `${description}\n\t${key}${optional}: ${schemaTypeToTS(value)};`;
		})
		.join('\n');

	return `export interface ${schemaName} {\n${props}\n}\n`;
}

/**
 * Main function to generate all types
 */
function generateTypes() {
	const schemas = {
		Store: 'store_schema.json',
		Brand: 'brand_schema.json',
		Material: 'material_schema.json',
		Filament: 'filament_schema.json'
	};

	let output = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Generated from JSON schemas by scripts/generate-types.js
 * Run: npm run generate:types
 */

`;

	for (const [typeName, schemaFile] of Object.entries(schemas)) {
		try {
			const schemaPath = join(schemasDir, schemaFile);
			const schemaContent = readFileSync(schemaPath, 'utf-8');
			const schema = JSON.parse(schemaContent);

			output += generateInterface(typeName, schema);
			output += '\n';
		} catch (error) {
			console.error(`Error processing ${schemaFile}:`, error.message);
		}
	}

	// Add the DatabaseIndex interface
	output += `export interface DatabaseIndex {
	stores: Store[];
	brands: Brand[];
}
`;

	writeFileSync(outputFile, output, 'utf-8');
	console.log('✓ Generated TypeScript types at:', outputFile);
}

// Run the generator
generateTypes();
