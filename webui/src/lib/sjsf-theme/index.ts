import { base } from '@sjsf/form/theme';
import { chain, fromRecord } from '@sjsf/form/lib/resolver';

// Core components
import FormComponent from './FormComponent.svelte';
import SubmitButtonComponent from './SubmitButtonComponent.svelte';
import LayoutComponent from './LayoutComponent.svelte';
import ButtonComponent from './ButtonComponent.svelte';

// Label/title components
import TitleComponent from './TitleComponent.svelte';
import LabelComponent from './LabelComponent.svelte';
import DescriptionComponent from './DescriptionComponent.svelte';
import ErrorsListComponent from './ErrorsListComponent.svelte';
import HelpComponent from './HelpComponent.svelte';

// Widget components
import TextWidgetComponent from './TextWidgetComponent.svelte';
import NumberWidgetComponent from './NumberWidgetComponent.svelte';
import SelectWidgetComponent from './SelectWidgetComponent.svelte';
import CheckboxWidgetComponent from './CheckboxWidgetComponent.svelte';

// All foundational components required by SJSF
const foundationalComponents = {
	// Core
	form: FormComponent,
	submitButton: SubmitButtonComponent,
	layout: LayoutComponent,
	button: ButtonComponent,

	// Labels/titles
	title: TitleComponent,
	label: LabelComponent,
	description: DescriptionComponent,
	errorsList: ErrorsListComponent,
	help: HelpComponent,

	// Widgets
	textWidget: TextWidgetComponent,
	numberWidget: NumberWidgetComponent,
	selectWidget: SelectWidgetComponent,
	checkboxWidget: CheckboxWidgetComponent
};

// Create theme: foundational components take priority, then fall back to base theme
export const theme = chain(fromRecord(foundationalComponents), base);
