<script lang="ts">
	import type { Snippet } from 'svelte';
	import { apiBaseUrl } from '$lib/stores/environment';
	import { get } from 'svelte/store';
	import {
		TextField,
		UrlField,
		NumberField,
		SelectField,
		CheckboxField,
		TagInput,
		CountryCodeList,
		ColorHexField,
		FormFieldRow,
		TwoColumnLayout
	} from '$lib/components/form-fields';
	import { Button } from '$lib/components/ui';
	import type { SchemaFormConfig, ProcessedField, RenderItem } from './schemaFormTypes';
	import {
		processFields,
		groupFieldsForRender,
		splitFields,
		fetchEnumValues,
		getFieldLabel,
		getFieldPlaceholder,
		transforms
	} from './schemaFormUtils';

	interface Props {
		schema: any;
		data: any;
		config?: SchemaFormConfig;
		onSubmit?: (data: any) => void;
		submitLabel?: string;
		saving?: boolean;
		submitDisabled?: boolean;
		// Snippets for custom content
		rightColumnContent?: Snippet;
		customFields?: Snippet<[string, any, ProcessedField]>;
		beforeFields?: Snippet;
		afterFields?: Snippet;
	}

	let {
		schema,
		data = $bindable({}),
		config = {},
		onSubmit,
		submitLabel = 'Submit',
		saving = false,
		submitDisabled = false,
		rightColumnContent,
		customFields,
		beforeFields,
		afterFields
	}: Props = $props();

	// Dynamic enum state
	let dynamicEnums = $state<Record<string, string[]>>({});
	let enumLoading = $state<Record<string, boolean>>({});

	// Process schema into renderable fields
	let processedFields = $derived(processFields(schema, config));

	// Split fields for TwoColumnLayout if configured
	let { leftFields, rightFields } = $derived.by(() => splitFields(processedFields, config.splitAfterKey));

	// Group fields for rendering
	let leftRenderItems = $derived(groupFieldsForRender(leftFields));
	let rightRenderItems = $derived(groupFieldsForRender(rightFields));

	// Resolve a $ref to find external schema file references
	function resolveExternalRef(propSchema: any): string | null {
		// Direct external ref on the property
		if (propSchema?.$ref && propSchema.$ref.startsWith('./')) {
			return propSchema.$ref;
		}

		// Check if it references a definition that has an external ref
		if (propSchema?.$ref?.startsWith('#/definitions/')) {
			const defName = propSchema.$ref.replace('#/definitions/', '');
			const definition = schema?.definitions?.[defName];
			if (definition?.$ref && definition.$ref.startsWith('./')) {
				return definition.$ref;
			}
		}

		return null;
	}

	// Load dynamic enums on mount - from config and from schema $ref
	$effect(() => {
		// Load from config enumSources
		if (config.enumSources) {
			for (const [key, source] of Object.entries(config.enumSources)) {
				loadEnum(key, source.url, source.path);
			}
		}

		// Load from schema $ref fields pointing to external files
		if (schema?.properties) {
			for (const [key, propSchema] of Object.entries(schema.properties) as [string, any][]) {
				if (config.enumSources?.[key]) continue; // Skip if already in config

				const externalRef = resolveExternalRef(propSchema);
				if (externalRef) {
					// Convert ./filename.json to /api/v1/schemas/filename.json
					const schemaFile = externalRef.replace('./', '');
					loadEnum(key, `/api/v1/schemas/${schemaFile}`, 'enum');
				}
			}
		}
	});

	async function loadEnum(key: string, url: string, path?: string) {
		if (enumLoading[key] || dynamicEnums[key]?.length) return;

		enumLoading[key] = true;
		try {
			const baseUrl = get(apiBaseUrl);
			const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
			const values = await fetchEnumValues(fullUrl, path);
			dynamicEnums[key] = values;
		} finally {
			enumLoading[key] = false;
		}
	}

	function handleSubmit() {
		onSubmit?.(data);
	}

	function handleFormSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!saving && !submitDisabled) {
			handleSubmit();
		}
	}

	function getLabel(field: ProcessedField): string {
		return getFieldLabel(field.key, field.schema, config.labels?.[field.key]);
	}

	function getTooltip(field: ProcessedField): string | undefined {
		return config.tooltips?.[field.key] || field.schema.description;
	}

	function getPlaceholder(field: ProcessedField): string {
		return getFieldPlaceholder(field.schema, config.placeholders?.[field.key]);
	}

	function getStep(field: ProcessedField): number | 'any' {
		if (config.steps?.[field.key] !== undefined) {
			return config.steps[field.key];
		}
		return field.schema.type === 'integer' ? 1 : 'any';
	}

	function getEnumOptions(field: ProcessedField): string[] {
		// Check dynamic enums first
		let options = dynamicEnums[field.key]?.length
			? dynamicEnums[field.key]
			: (field.schema.enum || []);

		// Filter out excluded values
		const excluded = config.excludeEnumValues?.[field.key];
		if (excluded?.length) {
			options = options.filter((v: string) => !excluded.includes(v));
		}

		return options;
	}

	function isEnumLoading(field: ProcessedField): boolean {
		return enumLoading[field.key] || false;
	}

	function getInputType(field: ProcessedField): 'text' | 'email' {
		if (field.schema.format === 'email') {
			return 'email';
		}
		return 'text';
	}

	function isAutoUppercase(field: ProcessedField): boolean {
		const transform = config.transforms?.[field.key];
		return transform === transforms.uppercase;
	}

	function getMaxLength(field: ProcessedField): number | undefined {
		return config.maxLengths?.[field.key] ?? field.schema.maxLength;
	}


</script>

{#snippet renderField(field: ProcessedField)}
	{@const label = getLabel(field)}
	{@const tooltip = getTooltip(field)}
	{@const placeholder = getPlaceholder(field)}
	{@const required = field.isRequired}

	{#if field.type === 'custom' && customFields}
		{@render customFields(field.key, field.schema, field)}
	{:else if field.type === 'url'}
		<UrlField
			bind:value={data[field.key]}
			id={field.key}
			{label}
			{required}
			{tooltip}
			{placeholder}
		/>
	{:else if field.type === 'text'}
		<TextField
			bind:value={data[field.key]}
			id={field.key}
			{label}
			{required}
			{tooltip}
			{placeholder}
			type={getInputType(field)}
			autoUppercase={isAutoUppercase(field)}
			maxLength={getMaxLength(field)}
		/>
	{:else if field.type === 'number'}
		<NumberField
			bind:value={data[field.key]}
			id={field.key}
			{label}
			{required}
			{tooltip}
			{placeholder}
			step={getStep(field)}
			min={field.schema.minimum}
			max={field.schema.maximum}
		/>
	{:else if field.type === 'select'}
		{@const options = getEnumOptions(field)}
		{@const loading = isEnumLoading(field)}
		<SelectField
			bind:value={data[field.key]}
			id={field.key}
			{label}
			{required}
			{tooltip}
			disabled={loading}
		>
			{#if loading}
				<option value="">Loading...</option>
			{:else}
				{#if !required}
					<option value="">Not set</option>
				{:else}
					<option value="">Select...</option>
				{/if}
				{#each options as option}
					<option value={option}>{option}</option>
				{/each}
			{/if}
		</SelectField>
	{:else if field.type === 'checkbox'}
		<CheckboxField
			bind:checked={data[field.key]}
			id={field.key}
			{label}
			{tooltip}
		/>
	{:else if field.type === 'tags'}
		<TagInput
			bind:tags={data[field.key]}
			{label}
			{tooltip}
			{placeholder}
		/>
	{:else if field.type === 'countryList'}
		<CountryCodeList
			bind:values={data[field.key]}
			{label}
			{required}
			{tooltip}
			{placeholder}
			maxLength={2}
			uppercase
		/>
	{:else if field.type === 'stringList'}
		<CountryCodeList
			bind:values={data[field.key]}
			{label}
			{required}
			{tooltip}
			{placeholder}
		/>
	{:else if field.type === 'color'}
		<ColorHexField
			bind:value={data[field.key]}
			id={field.key}
			{label}
			{required}
			{tooltip}
		/>
	{/if}
{/snippet}

{#snippet renderItem(item: RenderItem)}
	{#if item.isGroup}
		<FormFieldRow columns={item.fields.length > 3 ? 3 : item.fields.length}>
			{#each item.fields as field (field.key)}
				{@render renderField(field)}
			{/each}
		</FormFieldRow>
	{:else}
		{@render renderField(item.field)}
	{/if}
{/snippet}

{#snippet renderItems(items: RenderItem[])}
	{#each items as item, i (item.isGroup ? `group-${i}` : item.field.key)}
		{@render renderItem(item)}
	{/each}
{/snippet}

{#snippet submitButton()}
	{#if onSubmit}
		<div class="pt-4">
			<Button
				type="submit"
				disabled={saving || submitDisabled}
				class="w-full"
			>
				{saving ? 'Saving...' : submitLabel}
			</Button>
		</div>
	{/if}
{/snippet}

<!-- Main layout -->
<form onsubmit={handleFormSubmit} class="contents">
{#if config.splitAfterKey && rightColumnContent}
	<TwoColumnLayout leftWidth={config.leftWidth} leftSpacing={config.leftSpacing}>
		{#snippet leftContent()}
			{#if beforeFields}{@render beforeFields()}{/if}
			{@render renderItems(leftRenderItems)}
			{#if afterFields}{@render afterFields()}{/if}

			<!-- Spacer to push submit button to bottom -->
			<div class="flex-1"></div>
			{@render submitButton()}
		{/snippet}

		{#snippet rightContent()}
			{@render rightColumnContent()}
		{/snippet}
	</TwoColumnLayout>
{:else if rightColumnContent}
	<!-- Right content provided but no split key - still use two column layout -->
	<TwoColumnLayout leftWidth={config.leftWidth} leftSpacing={config.leftSpacing}>
		{#snippet leftContent()}
			{#if beforeFields}{@render beforeFields()}{/if}
			{@render renderItems(leftRenderItems)}
			{#if afterFields}{@render afterFields()}{/if}

			<!-- Spacer to push submit button to bottom -->
			<div class="flex-1"></div>
			{@render submitButton()}
		{/snippet}

		{#snippet rightContent()}
			{@render rightColumnContent()}
		{/snippet}
	</TwoColumnLayout>
{:else}
	<div class="space-y-4">
		{#if beforeFields}{@render beforeFields()}{/if}
		{@render renderItems(leftRenderItems)}
		{#if afterFields}{@render afterFields()}{/if}
		{@render submitButton()}
	</div>
{/if}
</form>
