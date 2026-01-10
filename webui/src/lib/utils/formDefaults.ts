import { resolver } from '@sjsf/form/resolvers/basic';
import { translation } from '@sjsf/form/translations/en';
import { createFormMerger } from '@sjsf/form/mergers/modern';
import { createFormIdBuilder } from '@sjsf/form/id-builders/modern';
import { createFormValidator } from '@sjsf/ajv8-validator';
import { theme } from '@sjsf/basic-theme';

export const formDefaults = {
	theme,
	resolver,
	translation,
	merger: createFormMerger,
	validator: createFormValidator,
	idBuilder: createFormIdBuilder
};
