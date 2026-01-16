import { resolver } from '@sjsf/form/resolvers/basic';
import { translation } from '@sjsf/form/translations/en';
import { createFormMerger } from '@sjsf/form/mergers/modern';
import { createFormIdBuilder } from '@sjsf/form/id-builders/modern';
import { createFormValidator } from '@sjsf/ajv8-validator';

// Using the base theme from @sjsf/form
// Styling is handled via Tailwind classes in schemaUtils.ts createUiSchema()
import { base as theme } from '@sjsf/form/theme';

export const formDefaults = {
	theme,
	resolver,
	translation,
	merger: createFormMerger,
	validator: createFormValidator,
	idBuilder: createFormIdBuilder
};
