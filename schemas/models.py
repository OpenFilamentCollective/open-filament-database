"""
Pydantic models for the Open Filament Database schemas.

This module defines all data models used in the database, which are also used
to generate the JSON schemas automatically.
"""

from typing import Literal, Optional, Union, List, Dict, Annotated, get_origin, get_args
from pydantic import BaseModel, Field, ConfigDict, StringConstraints, RootModel
from pydantic.fields import FieldInfo
import json
from pathlib import Path
import inspect

# String length constraint used across all schemas
MAX_STRING_LENGTH = 1000

# Custom type annotations using Pydantic's built-in constraints:
class LimitedString(RootModel):
    """String type with a maximum length constraint."""
    root: Annotated[str, StringConstraints(max_length=MAX_STRING_LENGTH)]

class CountryCode(RootModel):
    """String type for ISO 3166-1 alpha-2 country codes."""
    root: Annotated[str, StringConstraints(min_length=2, max_length=2, pattern=r"^([A-Z]{2})$")] | Literal['Unknown']

class Color(RootModel):
    """String or list of strings representing hex color codes."""
    root: Annotated[str, StringConstraints(pattern=r"^#?[a-fA-F0-9]{6}$")]

class Colors(RootModel):
    """Either a single hex color code string or a list of such strings."""
    root: Union[Color, List[Color]]

class Store(BaseModel):
    """Store information for purchase links."""
    model_config = ConfigDict(extra='forbid')

    id: LimitedString = Field(..., description="The ID for this store")
    name: LimitedString = Field(..., description="The name of this store")
    storefront_url: LimitedString = Field(..., description="A link to the storefront of this store")
    storefront_affiliate_link: Optional[LimitedString] = Field(None, description="An affiliate link to the storefront of this store")
    logo: LimitedString = Field(..., description="A link to the logo for this store")

    ships_from: Union[List[CountryCode], CountryCode] = Field(..., description="A list of locations the shop linked ships from")
    ships_to: Union[List[CountryCode], CountryCode] = Field(..., description="A list of locations the shop linked ships to")


class Brand(BaseModel):
    """Brand/manufacturer information."""
    model_config = ConfigDict(extra='forbid')

    brand: LimitedString = Field(..., description="The name of the filament manufacture")
    website: LimitedString = Field(..., description="The website of the filament manufacture")
    logo: LimitedString = Field(..., description="A link to the logo for this brand")
    origin: CountryCode = Field(..., description="The country of origin")


class GenericSlicerSettings(BaseModel):
    """Generic slicer settings that map to specific slicer configurations."""
    model_config = ConfigDict(extra='forbid')

    first_layer_bed_temp: Optional[int] = None
    first_layer_nozzle_temp: Optional[int] = None
    bed_temp: Optional[int] = None
    nozzle_temp: Optional[int] = None


class SpecificSlicerSettings(BaseModel):
    """Settings for a specific slicer application."""

    profile_name: LimitedString = Field(
        ...,
        description="The name of the profile for this filament. If there is a profile specifically for this filament, that is what should be specified, even if it is printer specific. For slic3r variants, data after the '@' does not need to be included and will be removed when loading into python."
    )
    overrides: Optional[Dict[str, Union[str, List[str]]]] = Field(
        None,
        description="Key-value pairs for settings that should be overridden for this filament"
    )


class SlicerSettings(BaseModel):
    """Settings for various slicer applications."""
    model_config = ConfigDict(extra='forbid')

    prusaslicer: Optional[SpecificSlicerSettings] = None
    bambustudio: Optional[SpecificSlicerSettings] = None
    orcaslicer: Optional[SpecificSlicerSettings] = None
    cura: Optional[SpecificSlicerSettings] = None
    generic: Optional[GenericSlicerSettings] = Field(
        None,
        description="Generic options that will automatically be mapped to the correct config definition for each slicer. Slicer specific settings are applied first, then these are applied on top."
    )



class Material(BaseModel):
    """Material type information."""
    model_config = ConfigDict(extra='forbid')

    material: LimitedString = Field(..., description="The material type of the filament")
    default_max_dry_temperature: Optional[int] = None
    default_slicer_settings: Optional[SlicerSettings] = Field(
        None,
        description="The default slicer settings that should be used for this type of filament material. This will be used in any case where a filament does not specify its own \"slicer_settings\""
    )



class SlicerIDs(BaseModel):
    """Slicer-specific IDs for the filament."""

    prusaslicer: Optional[LimitedString] = None
    bambustudio: Optional[LimitedString] = None
    orcaslicer: Optional[LimitedString] = None
    cura: Optional[LimitedString] = None


class Filament(BaseModel):
    """Filament product line information."""
    model_config = ConfigDict(extra='forbid')

    name: LimitedString = Field(..., description="The manufacture's name for this filament")
    diameter_tolerance: float = Field(..., description="The diameter tolerance of the filament (in mm)")
    density: float = Field(default=1.24, description="The density of the filament (in g/cm³)")
    max_dry_temperature: Optional[int] = None
    data_sheet_url: Optional[LimitedString] = None
    safety_sheet_url: Optional[LimitedString] = None
    discontinued: Optional[bool] = None
    slicer_ids: Optional[SlicerIDs] = None
    slicer_settings: Optional[SlicerSettings] = Field(
        None,
        description="The slicer settings that should be used for this filament. This will override what is set in \"default_slicer_settings\""
    )



class ColorStandards(BaseModel):
    """Standard color system identifiers."""

    ral: Optional[LimitedString] = None
    ncs: Optional[LimitedString] = None
    pantone: Optional[LimitedString] = None
    bs: Optional[LimitedString] = None
    munsell: Optional[LimitedString] = None


class Traits(BaseModel):
    """Physical and environmental traits of the filament."""
    model_config = ConfigDict(extra='forbid')

    translucent: Optional[bool] = Field(None, description="Indicates that the filament is translucent")
    glow: Optional[bool] = Field(None, description="Indicates that the filament glows in the dark")
    matte: Optional[bool] = Field(None, description="Indicates that the filament has a matte finish")
    recycled: Optional[bool] = Field(None, description="Indicates that the filament was made of recycled materials")
    recyclable: Optional[bool] = Field(None, description="Indicates that the filament can be recycled")
    biodegradable: Optional[bool] = Field(None, description="Indicates if the filament will biodegrade")


class Variant(BaseModel):
    """Color variant of a filament."""
    model_config = ConfigDict(extra='forbid')

    color_name: LimitedString = Field(..., description="The manufacturer's name for this filament color")
    color_hex: Colors = Field(..., description="The official hex color code for this filament")
    hex_variants: Optional[List[Color]] = Field(
        None,
        description="Alternative hex color codes that this filament is known to report or be identified as (e.g., via NFC)"
    )
    discontinued: Optional[bool] = None
    color_standards: Optional[ColorStandards] = None
    traits: Optional[Traits] = None



class PurchaseLink(BaseModel):
    """Purchase link for a specific size."""

    store_id: LimitedString
    url: LimitedString
    affiliate: bool
    spool_refill: bool = Field(default=False, description="Indicates if this is a refill for a reusable spool")
    ships_from: Optional[Union[List[CountryCode], CountryCode]] = Field(
        None,
        description="A list of locations the shop ships from. Defining this here will override the definition from the shop."
    )
    ships_to: Optional[Union[List[CountryCode], CountryCode]] = Field(
        None,
        description="A list of locations the shop ships to. Defining this here will override the definition from the shop."
    )


class FilamentSize(BaseModel):
    """Size/weight variant of a filament color."""
    model_config = ConfigDict(extra='forbid')

    filament_weight: float = Field(default=1000, description="The weight of the filament alone (in grams)")
    diameter: float = Field(default=1.75, description="The diameter of the filament (in mm)")
    empty_spool_weight: Optional[float] = Field(None, description="The weight of a spool with no filament (in grams)")
    spool_core_diameter: Optional[float] = Field(None, description="The diameter of the core of the spool")
    ean: Optional[LimitedString] = None
    article_number: Optional[LimitedString] = None
    barcode_identifier: Optional[LimitedString] = None
    nfc_identifier: Optional[LimitedString] = None
    qr_identifier: Optional[LimitedString] = None
    discontinued: Optional[bool] = None
    purchase_links: Optional[List[PurchaseLink]] = Field(
        None,
        description="A list of places to purchase this filament"
    )


# RootModel for sizes array schema
class FilamentSizeArray(RootModel[List[FilamentSize]]):
    """Array of filament sizes - models the sizes.json schema."""
    root: List[FilamentSize] = Field(..., min_length=1)


def generate_json_schemas(output_dir: Optional[Path] = None) -> Dict[str, dict]:
    schemas = {
        'store_schema.json': Store.model_json_schema(mode='validation'),
        'brand_schema.json': Brand.model_json_schema(mode='validation'),
        'material_schema.json': Material.model_json_schema(mode='validation'),
        'filament_schema.json': Filament.model_json_schema(mode='validation'),
        'variant_schema.json': Variant.model_json_schema(mode='validation'),
        'sizes_schema.json': FilamentSizeArray.model_json_schema(mode='validation')
    }

    if output_dir:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        for schema_name, schema_def in schemas.items():
            output_file = output_dir / schema_name
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(schema_def, f, indent=4)
            print(f"Generated: {output_file}")

    return schemas


def type_to_zod(type_hint, field_info: Optional[FieldInfo] = None, is_optional: bool = False) -> str:
    """
    Convert a Python type hint to a Zod schema string.
    """
    origin = get_origin(type_hint)
    args = get_args(type_hint)
    
    # Handle Union types (including Optional)
    if origin is Union:
        non_none_types = [t for t in args if t is not type(None)]
        if len(non_none_types) == 1:
            # This is Optional[T]
            inner_type = type_to_zod(non_none_types[0], field_info, is_optional=True)
            # Don't add nullable here since model_to_zod will handle it
            return inner_type
        else:
            # Multiple types in union
            union_types = [type_to_zod(t, field_info) for t in non_none_types]
            schema = f"z.union([{', '.join(union_types)}])"
            # Don't add nullable here for Optional unions, it will be handled by model_to_zod
            return schema
    
    # Handle List types
    if origin is list or origin is List:
        element_type = type_to_zod(args[0] if args else str, field_info)
        return f"z.array({element_type})"
    
    # Handle Dict types
    if origin is dict or origin is Dict:
        if args:
            key_type = args[0]
            value_type = args[1] if len(args) > 1 else 'any'
            if key_type == str:
                value_schema = type_to_zod(value_type, field_info)
                return f"z.record(z.string(), {value_schema})"
        return "z.record(z.string(), z.any())"
    
    # Handle Literal types
    if origin is Literal:
        literals = [f'"{arg}"' if isinstance(arg, str) else str(arg) for arg in args]
        if len(literals) == 1:
            return f"z.literal({literals[0]})"
        return f"z.union([{', '.join([f'z.literal({lit})' for lit in literals])}])"
    
    # Handle Annotated types (with constraints)
    if origin is Annotated:
        base_type = args[0]
        constraints = args[1:]
        
        if base_type == str:
            zod_str = "z.string()"
            for constraint in constraints:
                if isinstance(constraint, StringConstraints):
                    if constraint.min_length is not None:
                        zod_str += f".min({constraint.min_length})"
                    if constraint.max_length is not None:
                        zod_str += f".max({constraint.max_length})"
                    if constraint.pattern is not None:
                        zod_str += f".regex(/{constraint.pattern}/)"
            return zod_str
        
        return type_to_zod(base_type, field_info)
    
    # Handle custom model types
    if inspect.isclass(type_hint):
        if issubclass(type_hint, RootModel):
            # For RootModel types, we reference them as schemas
            return type_hint.__name__ + "Schema"
        elif issubclass(type_hint, BaseModel):
            # For BaseModel types, we reference them as schemas
            return type_hint.__name__ + "Schema"
    
    # Handle primitive types
    if type_hint == str:
        return "z.string()"
    elif type_hint == int:
        return "z.number().int()"
    elif type_hint == float:
        return "z.number()"
    elif type_hint == bool:
        return "z.boolean()"
    
    # Default case
    return "z.any()"


def model_to_zod(model_class) -> str:
    """
    Converts a Pydantic model to a Zod schema string.
    For nested BaseModel or RootModel assume it already has a Zod schema defined elsewhere.
    assumes z is already imported
    """
    
    class_name = model_class.__name__
    
    # Handle RootModel types
    if issubclass(model_class, RootModel):
        # Get the root type annotation
        root_type = model_class.model_fields['root'].annotation
        
        # Special handling for specific RootModel types
        if class_name == "LimitedString":
            return f"export const {class_name}Schema = z.string().max({MAX_STRING_LENGTH});"
        elif class_name == "CountryCode":
            return f'export const {class_name}Schema = z.union([z.string().length(2).regex(/^[A-Z]{{2}}$/), z.literal("Unknown")]);'
        elif class_name == "Color":
            return f"export const {class_name}Schema = z.string().regex(/^#?[a-fA-F0-9]{{6}}$/);"
        elif class_name == "Colors":
            return f"export const {class_name}Schema = z.union([ColorSchema, z.array(ColorSchema)]);"
        elif class_name == "FilamentSizeArray":
            return f"export const {class_name}Schema = z.array(FilamentSizeSchema).min(1);"
        else:
            # Generic RootModel handling
            zod_type = type_to_zod(root_type)
            return f"export const {class_name}Schema = {zod_type};"
    
    # Handle BaseModel types
    fields_list = []
    
    for field_name, field_info in model_class.model_fields.items():
        field_type = field_info.annotation
        default_value = field_info.default
        
        # Generate the Zod type
        zod_type = type_to_zod(field_type, field_info)
        
        # Check if field has Optional type (Union with None)
        origin = get_origin(field_type)
        args = get_args(field_type)
        is_optional_type = (
            origin is Union and type(None) in args
        )
        
        # Add optional/nullish modifiers based on default value
        # Use .optional() for fields that can be omitted (undefined in JS)
        # Use .nullish() for fields that can be null or omitted
        if is_optional_type:
            # Field is Optional[T] in type hint - can be null or omitted
            zod_type += ".nullish()"
        elif default_value is not ... and str(default_value) != "PydanticUndefined":
            # Field has a default value but is not Optional
            if default_value is None:
                zod_type += ".nullish()"
            else:
                # Has a non-None default value
                default_str = f'"{default_value}"' if isinstance(default_value, str) else str(default_value).lower() if isinstance(default_value, bool) else str(default_value)
                zod_type += f".default({default_str})"
        
        # Add description if present
        if field_info.description:
            description = field_info.description.replace('"', '\\"')
            zod_type += f'.describe("{description}")'
        
        fields_list.append(f'  {field_name}: {zod_type}')
    
    # Build the complete schema
    fields_str = ',\n'.join(fields_list)
    
    # Add .strict() for models with extra='forbid'
    strict_modifier = ""
    if hasattr(model_class, 'model_config') and model_class.model_config.get('extra') == 'forbid':
        strict_modifier = ".strict()"
    
    return f"export const {class_name}Schema = z.object({{\n{fields_str}\n}}){strict_modifier};"


def models_to_zod() -> str:
    """
    Converts all defined Pydantic models to Zod schema strings.
    """
    
    output = 'import { z } from "zod";\n\n'
    output += f"// Maximum string length used across all schemas\n"
    output += f"const MAX_STRING_LENGTH = {MAX_STRING_LENGTH};\n\n"
    
    # Define the order of models to ensure dependencies are defined first
    model_classes = [
        # RootModel types first (they are type aliases essentially)
        LimitedString,
        CountryCode,
        Color,
        Colors,
        
        # BaseModel types in dependency order
        Store,
        Brand,
        GenericSlicerSettings,
        SpecificSlicerSettings,
        SlicerSettings,
        Material,
        SlicerIDs,
        Filament,
        ColorStandards,
        Traits,
        Variant,
        PurchaseLink,
        FilamentSize,
        FilamentSizeArray,
    ]
    
    for model_class in model_classes:
        comment = f"// {model_class.__doc__}" if model_class.__doc__ else f"// {model_class.__name__}"
        output += comment + "\n"
        output += model_to_zod(model_class) + "\n\n"
    
    # Add TypeScript type exports
    output += "// TypeScript type exports\n"
    for model_class in model_classes:
        class_name = model_class.__name__
        output += f"export type {class_name} = z.infer<typeof {class_name}Schema>;\n"
    
    return output


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description="Generate JSON schemas from Pydantic models.")
    parser.add_argument("--dry-run", action="store_true", help="Print schemas to console instead of writing to files")
    parser.add_argument('--generate', action='store_true', help="Generate JSON schemas to the specified directory")
    parser.add_argument('--zod', action='store_true', help="Generate Zod schemas")
    parser.add_argument('dir', nargs='?', default=None, help="Output directory for generated schemas")
    args = parser.parse_args()

    if args.dry_run:
        schemas = generate_json_schemas()
        for name, schema in schemas.items():
            print(f"Schema: {name}")
            print(json.dumps(schema, indent=4))
            print("\n")
    elif args.generate:
        output_dir = Path(__file__).parent if args.dir is None else Path(args.dir)
        generate_json_schemas(output_dir)
    elif args.zod:
        zod_output = models_to_zod()
        print(zod_output)
    else:
        parser.print_help()
        exit(1)