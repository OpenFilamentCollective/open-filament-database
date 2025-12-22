import json
import os
import re
from copy import deepcopy
from json import JSONDecodeError
from pathlib import Path
from typing import Optional, Any, Union, Self

from jsonschema.exceptions import ValidationError
from jsonschema.validators import validate

PathLike = Union[str, os.PathLike[str]]

COLOR_HEX_PATTERN = re.compile(r"#?([a-fA-F0-9]{6})")

# Global variable that denotes the last json file that was read
# This is used to for json validation error messages
last_json_file_loaded = ""


# ---------------------------------
# General Methods
# ---------------------------------

def shallow_remove_empty(input_dict: dict):
    """Remove elements that are 'None' or have an empty list/dict"""
    cpy = input_dict.copy()
    for k, v in input_dict.items():
        if v is None or (isinstance(v, (list, dict)) and len(v) == 0):
            del cpy[k]
    return cpy


def normalize_color_hex(input_data: list[str]):
    """Takes a list of color hex values and strips whitespace then removes the leading '#'"""
    res: list[str] = []
    for item in input_data:
        match = re.fullmatch(COLOR_HEX_PATTERN, item.strip())
        if match:
            res.append(match.group(1).upper())
        else:
            raise Exception("Unknown value in the hex data")
    return res


def cleanse_folder_name(name: str) -> str:
    return name.replace("/", " ").strip()


def get_json_from_file(json_path: PathLike):
    """
    Attempt to load JSON from the specified path
    :returns Loaded JSON as a dict or None if there is an error
    """
    try:
        global last_json_file_loaded
        last_json_file_loaded = json_path.__str__()
        with open(json_path, mode="r", encoding="utf8") as file:
            return json.load(file)
    except JSONDecodeError:
        print(f"Failed to import JSON from file: {json_path}")
    except OSError:
        print(f"Failed to open the provided JSON file: {json_path}")
    return None


def validate_json(json_data, schema) -> bool:
    """
    Validate the json data with the provided schema
    If valid, returns true.
    If not valid, returns false and emits an error message
    """
    try:
        validate(json_data, schema)
        return True
    except ValidationError as error:
        print(
            f"Failed to validate json. JSON path: {error.json_path}, Error: {error.message}, JSON file: {last_json_file_loaded}")
        return False


# These will be inited at the end of the file
STORE_SCHEMA: dict
BRAND_SCHEMA: dict
MATERIAL_SCHEMA: dict
FILAMENT_SCHEMA: dict
VARIANT_SCHEMA: dict
SIZE_SCHEMA: dict


# ---------------------------------
# Interfaces
# ---------------------------------

class IToFromJSONData:
    """
    An interface that defines the required methods for storing and retrieving from json data
    """

    def to_dict(self) -> dict:
        """
        :returns: The object as a dict
        """
        ...

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent):
        ...


class IToFromFS(IToFromJSONData):
    """
    This is an interface that defines the required methods for storing and retrieving from a folder based structure
    """

    def to_json_file(self, parent_folder: PathLike):
        """
        Saves this object as a json file
        :param parent_folder: The folder where the json file should be stored
        """
        path = Path(parent_folder)
        if not path.is_dir():
            print(f"The provided path is not a folder: {path.__str__()}")
            return
        with path.joinpath(f"{self._file_name()}.json").open("w") as f:
            json.dump(self.to_dict(), f, indent=4)

    def to_folder(self, parent_folder: PathLike):
        """Creates a folder within the parent folder and store the json file within it"""
        ...

    @classmethod
    def from_json_file(cls, json_file_path: PathLike, parent) -> Optional[Self]:
        """Returns an instance of the class from a JSON file"""
        return cls.from_json_data(get_json_from_file(json_file_path), parent)

    @classmethod
    def from_folder(cls, folder_path: PathLike, parent):
        """Returns an instance of the class from a folder"""
        path = Path(folder_path)
        if not cls.check_folder(path):
            return None
        ret = cls.from_json_file(path.joinpath(f"{cls._file_name()}.json"), parent)
        return ret

    @classmethod
    def _file_name(cls) -> str:
        """Returns the json file's name (without the .json extension)"""
        return cls.__name__.lower()

    @classmethod
    def check_folder(cls, path: Path):
        """Check if the provided path is a valid folder and contains the required JSON folder"""
        if not path.is_dir():
            print(f"Failed to init from provided folder. The provided path is not a folder: {path.__str__()}")
            return False
        if not path.joinpath(f"{cls._file_name()}.json").exists():
            print(
                f"Failed to init from provided folder. The provided path does not have a {cls._file_name()}.json file: {path.__str__()}")
            return False
        return True


# ---------------------------------
# store.json
# ---------------------------------

class Store(IToFromJSONData):
    store_id: str
    name: str
    storefront_url: str
    logo: str
    ships_from: list[str]
    ships_to: list[str]

    def __init__(self,
                 store_id: str,
                 name: str,
                 storefront_url: str,
                 logo: str,
                 ships_from: list[str] = None,
                 ships_to: list[str] = None):
        if ships_from is None:
            ships_from = []
        if ships_to is None:
            ships_to = []

        self.store_id = store_id
        self.name = name
        self.storefront_url = storefront_url
        self.logo = logo
        self.ships_from = ships_from
        self.ships_to = ships_to

    def to_dict(self):
        return shallow_remove_empty({
            "id": self.store_id,
            "name": self.name,
            "storefront_url": self.storefront_url,
            "logo": self.logo,
            "ships_from": self.ships_from,
            "ships_to": self.ships_to
        })

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: None = None) -> Optional['Store']:
        return Store(
            store_id=json_data["id"],
            name=json_data["name"],
            storefront_url=json_data["storefront_url"],
            logo=json_data["logo"],
            ships_from=json_data.get("ships_from", []),
            ships_to=json_data.get("ships_to", [])
        )


# ---------------------------------
# Load/Save Stores
# ---------------------------------

stores: dict[str, Store]


def load_stores():
    global stores
    stores = {}
    stores_dir = Path("stores")
    for item in stores_dir.iterdir():
        store_file = item.joinpath("store.json")
        if not item.is_dir() or not store_file.exists():
            continue

        # Verify the schema
        json_data = get_json_from_file(store_file)
        if not validate_json(json_data, STORE_SCHEMA):
            # An error msg will be emitted by the validate function if there is an error
            continue
        store = Store.from_json_data(json_data)
        if stores.__contains__(store.store_id):
            print(f"There were multiple stores with the same store ID: {store.store_id}")
            continue
        stores[store.store_id] = store


def save_stores(parent_folder: PathLike):
    path = Path(parent_folder)
    if not path.is_dir():
        print(f"The provided path is not a folder: {path.__str__()}")
        return
    for store_id, store_data in stores.items():
        store_path = path.joinpath(store_id)
        store_path.mkdir(exist_ok=True)
        with store_path.joinpath("store.json").open("w") as f:
            json.dump(store_data.to_dict(), f, indent=4)


# ---------------------------------
# sizes.json
# ---------------------------------

class SizePurchaseLink(IToFromJSONData):
    store: Store  # Required
    url: str  # Required
    spool_refill: bool
    ships_from: list[str]
    ships_to: list[str]

    def __init__(self,
                 store_id: str,
                 url: str,
                 spool_refill=False,
                 ships_from: list[str] = None,
                 ships_to: list[str] = None):
        if ships_from is None:
            ships_from = []
        if ships_to is None:
            ships_to = []

        self.store = stores[store_id]
        self.url = url
        self.spool_refill = spool_refill
        self.ships_from = ships_from
        self.ships_to = ships_to

    def get_ships_from(self):
        """
        Get the correct ships_from value
        If this SizePurchaseLink has a ships_from value, that is returned
        Otherwise, the ships_from value from self.store is used
        """
        if self.ships_from:
            return self.ships_from
        return self.store.ships_from

    def get_ships_to(self):
        """
        Get the correct ships_to value
        If this SizePurchaseLink has a ships_to value, that is returned
        Otherwise, the ships_to value from self.store is used
        """
        if self.ships_to:
            return self.ships_to
        return self.store.ships_to

    def to_dict(self):
        return shallow_remove_empty({
            "store_id": self.store.store_id,
            "url": self.url,
            "spool_refill": self.spool_refill,
            "ships_from": self.ships_from,
            "ships_to": self.ships_to
        })

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: None = None) -> 'SizePurchaseLink':
        return SizePurchaseLink(
            store_id=json_data["store_id"],
            url=json_data["url"],
            spool_refill=json_data.get("spool_refill", False),
            ships_from=json_data.get("ships_from", []),
            ships_to=json_data.get("ships_to", [])
        )


class FilamentSize(IToFromJSONData):
    filament_weight: float  # Required
    diameter: float  # Required
    empty_spool_weight: Optional[float]
    spool_core_diameter: Optional[float]
    gtin: Optional[str]
    ean: Optional[str]
    article_number: Optional[str]
    barcode_identifier: Optional[str]
    nfc_identifier: Optional[str]
    qr_identifier: Optional[str]
    discontinued: Optional[bool]
    purchase_links: list[SizePurchaseLink]

    def __init__(self,
                 filament_weight: float,
                 diameter: float,
                 empty_spool_weight: Optional[float] = None,
                 spool_core_diameter: Optional[float] = None,
                 gtin: Optional[str] = None,
                 ean: Optional[str] = None,
                 article_number: Optional[str] = None,
                 barcode_identifier: Optional[str] = None,
                 nfc_identifier: Optional[str] = None,
                 qr_identifier: Optional[str] = None,
                 discontinued: Optional[bool] = None,
                 purchase_links: list[SizePurchaseLink] = None):
        if purchase_links is None:
            purchase_links = []

        self.filament_weight = filament_weight
        self.diameter = diameter
        self.empty_spool_weight = empty_spool_weight
        self.spool_core_diameter = spool_core_diameter
        # Normalize and validate GTIN/EAN per rules
        gtin = gtin.strip() if isinstance(gtin, str) else gtin
        ean = ean.strip() if isinstance(ean, str) else ean

        gtin_pattern = re.compile(r"^[0-9]{12,13}$")
        ean_pattern = re.compile(r"^[0-9]{13}$")

        # Input normalization
        if (not gtin) and ean and ean_pattern.fullmatch(ean):
            gtin = ean
        if gtin and (not ean) and len(gtin) == 13:
            ean = gtin

        # Validation rules
        if gtin is not None:
            if not gtin_pattern.fullmatch(gtin):
                raise Exception("Invalid gtin: must be 12 or 13 digits only")
        if ean is not None:
            if not ean_pattern.fullmatch(ean):
                raise Exception("Invalid ean: must be exactly 13 digits")
        if gtin and ean:
            if len(gtin) == 13 and len(ean) == 13 and gtin != ean:
                raise Exception("Mismatch between gtin and ean (both 13 digits); they must match")

        self.gtin = gtin
        self.ean = ean
        self.article_number = article_number
        self.barcode_identifier = barcode_identifier
        self.nfc_identifier = nfc_identifier
        self.qr_identifier = qr_identifier
        self.discontinued = discontinued
        self.purchase_links = purchase_links

    def to_dict(self):
        # Output normalization: always include gtin; also return ean for legacy clients
        ean_out = self.ean
        if (ean_out is None or ean_out == "") and isinstance(self.gtin, str) and len(self.gtin) == 13:
            ean_out = self.gtin

        return shallow_remove_empty({
            "filament_weight": self.filament_weight,
            "diameter": self.diameter,
            "empty_spool_weight": self.empty_spool_weight,
            "spool_core_diameter": self.spool_core_diameter,
            "gtin": self.gtin,
            "ean": ean_out,
            "article_number": self.article_number,
            "barcode_identifier": self.barcode_identifier,
            "nfc_identifier": self.nfc_identifier,
            "qr_identifier": self.qr_identifier,
            "discontinued": self.discontinued,
            "purchase_links": [x.to_dict() for x in self.purchase_links]
        })

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: None = None) -> 'FilamentSize':
        purchase_links = []
        for data in json_data.get("purchase_links", []):
            purchase_links.append(SizePurchaseLink.from_json_data(data))

        return FilamentSize(
            filament_weight=json_data["filament_weight"],
            diameter=json_data["diameter"],
            empty_spool_weight=json_data.get("empty_spool_weight"),
            spool_core_diameter=json_data.get("spool_core_diameter"),
            gtin=json_data.get("gtin"),
            ean=json_data.get("ean"),
            article_number=json_data.get("article_number"),
            barcode_identifier=json_data.get("barcode_identifier"),
            nfc_identifier=json_data.get("nfc_identifier"),
            qr_identifier=json_data.get("qr_identifier"),
            discontinued=json_data.get("discontinued"),
            purchase_links=purchase_links
        )


# ---------------------------------
# variant.json
# ---------------------------------

class VariantTraits(IToFromJSONData):
    translucent: Optional[bool]
    glow: Optional[bool]
    matte: Optional[bool]
    recycled: Optional[bool]
    recyclable: Optional[bool]
    biodegradable: Optional[bool]

    def __init__(self,
                 translucent: Optional[bool] = None,
                 glow: Optional[bool] = None,
                 matte: Optional[bool] = None,
                 recycled: Optional[bool] = None,
                 recyclable: Optional[bool] = None,
                 biodegradable: Optional[bool] = None):
        self.translucent = translucent
        self.glow = glow
        self.matte = matte
        self.recycled = recycled
        self.recyclable = recyclable
        self.biodegradable = biodegradable

    def to_dict(self):
        return shallow_remove_empty(self.__dict__)

    @staticmethod
    def from_json_data(json_data: Optional[dict[str, Any]], parent: None = None) -> 'VariantTraits':
        if json_data is None:
            return VariantTraits()

        return VariantTraits(
            translucent=json_data.get("translucent"),
            glow=json_data.get("glow"),
            matte=json_data.get("matte"),
            recycled=json_data.get("recycled"),
            recyclable=json_data.get("recyclable"),
            biodegradable=json_data.get("biodegradable")
        )


class ColorStandards(IToFromJSONData):
    ral: Optional[str]
    ncs: Optional[str]
    pantone: Optional[str]
    bs: Optional[str]
    munsell: Optional[str]

    def __init__(self,
                 ral: Optional[str] = None,
                 ncs: Optional[str] = None,
                 pantone: Optional[str] = None,
                 bs: Optional[str] = None,
                 munsell: Optional[str] = None):
        self.ral = ral
        self.ncs = ncs
        self.pantone = pantone
        self.bs = bs
        self.munsell = munsell

    def to_dict(self):
        return shallow_remove_empty(self.__dict__)

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: None = None) -> Optional['ColorStandards']:
        if json_data is None:
            return ColorStandards()

        return ColorStandards(ral=json_data.get("ral"),
                              ncs=json_data.get("ncs"),
                              pantone=json_data.get("pantone"),
                              bs=json_data.get("bs"),
                              munsell=json_data.get("munsell"))


class FilamentVariant(IToFromFS):
    __parent: 'Filament'

    color_name: str  # Required
    color_hex: list[str]  # Required
    discontinued: Optional[bool]
    color_standards: ColorStandards
    traits: VariantTraits
    sizes: list[FilamentSize]

    def __init__(self,
                 parent: 'Filament',
                 color_name: str,
                 color_hex: str | list[str],
                 discontinued: Optional[bool] = None,
                 color_standards: ColorStandards = None,
                 traits: Optional[VariantTraits] = None,
                 sizes: Optional[list[FilamentSize]] = None):
        if color_standards is None:
            color_standards = ColorStandards()
        if traits is None:
            traits = VariantTraits()
        if sizes is None:
            sizes = []
        if isinstance(color_hex, str):
            color_hex = [color_hex]

        self.__parent = parent
        self.color_name = color_name
        self.color_hex = normalize_color_hex(color_hex)
        self.discontinued = discontinued
        self.color_standards = color_standards
        self.traits = traits
        self.sizes = sizes

    @property
    def parent(self):
        return self.__parent

    @classmethod
    def _file_name(cls) -> str:
        return "variant"

    @property
    def pretty_color_hex(self):
        """
        Returns an array of color hexes with the '#'
        """
        return ["#" + x for x in self.color_hex]

    def to_dict(self):
        return shallow_remove_empty({
            "color_name": self.color_name,
            "color_hex": self.pretty_color_hex[0] if len(self.color_hex) == 1 else self.pretty_color_hex,
            "discontinued": self.discontinued,
            "color_standards": self.color_standards.to_dict(),
            "traits": self.traits.to_dict()
        })

    def __sizes_to_json_file(self, parent_folder: PathLike):
        path = Path(parent_folder)
        if not path.is_dir():
            print(f"The provided path is not a folder: {path.__str__()}")
            return
        with path.joinpath("sizes.json").open("w") as f:
            json.dump([x.to_dict() for x in self.sizes], f, indent=4)

    def to_folder(self, parent_folder: PathLike):
        path = Path(parent_folder)
        if not path.exists() or not path.is_dir():
            print(f"The provided path is not a folder: {path.__str__()}")
            return
        path = path.joinpath(cleanse_folder_name(self.color_name))
        path.mkdir(parents=True, exist_ok=True)
        self.to_json_file(path)
        self.__sizes_to_json_file(path)

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: 'Filament') -> Optional['FilamentVariant']:
        if not validate_json(json_data, VARIANT_SCHEMA):
            # An error msg will be emitted by the validate function if there is an error
            return None

        return FilamentVariant(
            parent=parent,
            color_name=json_data["color_name"],
            color_hex=json_data["color_hex"],
            discontinued=json_data.get("discontinued"),
            color_standards=ColorStandards.from_json_data(json_data.get("color_standards")),
            traits=VariantTraits.from_json_data(json_data.get("traits"))
        )

    @staticmethod
    def __sizes_from_folder(folder_path: PathLike) -> Optional[list[FilamentSize]]:
        json_data = get_json_from_file(f"{folder_path}/sizes.json")
        if not validate_json(json_data, SIZE_SCHEMA):
            # An error msg will be emitted by the validate function if there is an error
            return None
        if not isinstance(json_data, list):
            return None
        return [FilamentSize.from_json_data(x) for x in json_data]

    @classmethod
    def from_folder(cls, folder_path: PathLike, parent: 'Filament') -> Optional['FilamentVariant']:
        variant = super().from_folder(folder_path, parent)

        # ensure return was not None and hint the typing system
        if not isinstance(variant, FilamentVariant): return None

        variant.sizes = cls.__sizes_from_folder(folder_path)

        if not variant.sizes:
            return None

        return variant


# ---------------------------------
# SlicerSettings
# For filament.json and material.json
# ---------------------------------

class GenericSlicerSettings(IToFromJSONData):
    first_layer_bed_temp: Optional[int]
    first_layer_nozzle_temp: Optional[int]
    bed_temp: Optional[int]
    nozzle_temp: Optional[int]

    def __init__(self,
                 first_layer_bed_temp: Optional[int] = None,
                 first_layer_nozzle_temp: Optional[int] = None,
                 bed_temp: Optional[int] = None,
                 nozzle_temp: Optional[int] = None):
        self.first_layer_bed_temp = first_layer_bed_temp
        self.first_layer_nozzle_temp = first_layer_nozzle_temp
        self.bed_temp = bed_temp
        self.nozzle_temp = nozzle_temp

    def update(self, other: 'GenericSlicerSettings'):
        if other.first_layer_bed_temp is not None:
            self.first_layer_bed_temp = other.first_layer_bed_temp
        if other.first_layer_nozzle_temp is not None:
            self.first_layer_nozzle_temp = other.first_layer_nozzle_temp
        if other.bed_temp is not None:
            self.bed_temp = other.bed_temp
        if other.nozzle_temp is not None:
            self.nozzle_temp = other.nozzle_temp

    def to_dict(self):
        return shallow_remove_empty(self.__dict__)

    @staticmethod
    def from_json_data(json_data: Optional[dict[str, Any]], parent: None = None) -> Optional['GenericSlicerSettings']:
        if json_data is None:
            return None

        return GenericSlicerSettings(
            first_layer_bed_temp=json_data.get("first_layer_bed_temp"),
            first_layer_nozzle_temp=json_data.get("first_layer_nozzle_temp"),
            bed_temp=json_data.get("bed_temp"),
            nozzle_temp=json_data.get("nozzle_temp")
        )


class SpecificSlicerSettings(IToFromJSONData):
    profile_name: str  # Required
    overrides: dict[str, str]

    def __init__(self,
                 profile_name: str,
                 overrides: Optional[dict[str, str]] = None):
        if overrides is None:
            overrides = {}
        if "@" in profile_name:
            profile_name = profile_name[:profile_name.rfind("@")].rstrip()

        self.profile_name = profile_name
        self.overrides = overrides

    def update(self, other: 'SpecificSlicerSettings'):
        if other is None: return
        self.profile_name = other.profile_name
        self.overrides.update(other.overrides)

    def to_dict(self):
        return shallow_remove_empty({
            "profile_name": self.profile_name,
            "overrides": self.overrides
        })

    @staticmethod
    def from_json_data(json_data: Optional[dict[str, Any]], parent: None = None) -> Optional['SpecificSlicerSettings']:
        if json_data is None:
            return None

        return SpecificSlicerSettings(
            profile_name=json_data["profile_name"],
            overrides=json_data.get("overrides")
        )


class SlicerSettings(IToFromJSONData):
    prusaslicer: Optional[SpecificSlicerSettings]
    bambustudio: Optional[SpecificSlicerSettings]
    orcaslicer: Optional[SpecificSlicerSettings]
    cura: Optional[SpecificSlicerSettings]
    generic: Optional[GenericSlicerSettings]

    PS_MAP = {
        "first_layer_bed_temp": "first_layer_bed_temperature",
        "first_layer_nozzle_temp": "first_layer_temperature",
        "bed_temp": "bed_temperature",
        "nozzle_temp": "temperature"
    }
    BS_MAP = {
        "first_layer_bed_temp": "hot_plate_temp_initial_layer",
        "first_layer_nozzle_temp": "nozzle_temperature_initial_layer",
        "bed_temp": "hot_plate_temp",
        "nozzle_temp": "nozzle_temperature"
    }
    ORCA_MAP = {
        "first_layer_bed_temp": "hot_plate_temp_initial_layer",
        "first_layer_nozzle_temp": "nozzle_temperature_initial_layer",
        "bed_temp": "hot_plate_temp",
        "nozzle_temp": "nozzle_temperature"
    }
    CURA_MAP = {
        "first_layer_bed_temp": "material_bed_temperature_layer_0",
        "first_layer_nozzle_temp": "material_print_temperature_layer_0",
        "bed_temp": "material_bed_temperature",
        "nozzle_temp": "material_print_temperature"
    }

    def __init__(self,
                 prusaslicer: Optional[SpecificSlicerSettings] = None,
                 bambustudio: Optional[SpecificSlicerSettings] = None,
                 orcaslicer: Optional[SpecificSlicerSettings] = None,
                 cura: Optional[SpecificSlicerSettings] = None,
                 generic: Optional[GenericSlicerSettings] = None):
        self.prusaslicer = prusaslicer
        self.bambustudio = bambustudio
        self.orcaslicer = orcaslicer
        self.cura = cura
        self.generic = generic

    def __contains__(self, item: str):
        attrib = self.__getattribute__(item)
        if isinstance(attrib, (SpecificSlicerSettings, GenericSlicerSettings)):
            return True
        return False

    def __getitem__(self, item: str) -> Optional[SpecificSlicerSettings | GenericSlicerSettings]:
        attrib = self.__getattribute__(item)
        if isinstance(attrib, (SpecificSlicerSettings, GenericSlicerSettings)):
            return attrib
        return None

    def get_prusaslicer_data(self):
        if self.prusaslicer is None:
            return None
        prusaslicer = deepcopy(self.prusaslicer)
        self.__map_generic_to_overrides(prusaslicer, self.PS_MAP)
        return prusaslicer

    def get_bambustudio_data(self):
        if self.bambustudio is None:
            return None
        bambustudio = deepcopy(self.bambustudio)
        self.__map_generic_to_overrides(bambustudio, self.BS_MAP)
        return bambustudio

    def get_orcaslicer_data(self):
        if self.orcaslicer is None:
            return None
        orcaslicer = deepcopy(self.orcaslicer)
        self.__map_generic_to_overrides(orcaslicer, self.ORCA_MAP)
        return orcaslicer

    def get_cura_data(self):
        if self.cura is None:
            return None
        cura = deepcopy(self.cura)
        self.__map_generic_to_overrides(cura, self.CURA_MAP)
        return cura

    def get_slicer_data(self, slicer_name: str):
        attrib = self.__getattribute__(f"get_{slicer_name}_data")
        if callable(attrib):
            ret = attrib()
            if isinstance(ret, Optional[SpecificSlicerSettings]):
                return ret
        raise Exception(f"There is not a function named 'get_{slicer_name}_data' in SlicerSettings")

    def __map_generic_to_overrides(self, specific_settings: SpecificSlicerSettings, override_map: dict[str, str]):
        generic = self.generic
        if generic is None:
            return
        for k, v in override_map.items():
            value = getattr(generic, k)
            if value is not None:
                specific_settings.overrides[v] = value

    def update(self, other: 'SlicerSettings'):
        for var in ["prusaslicer", "bambustudio", "orcaslicer", "cura", "generic"]:
            this_var = getattr(self, var)
            other_var = getattr(other, var)
            if other_var is not None:
                if this_var is None:
                    setattr(self, var, other_var)
                elif isinstance(this_var, (SpecificSlicerSettings, GenericSlicerSettings)):
                    this_var.update(other_var)

    def to_dict(self):
        return {k: v.to_dict() for k, v in self.__dict__.items() if v is not None}

    @staticmethod
    def from_json_data(json_data: Optional[dict[str, Any]], parent: None = None):
        if json_data is None:
            return None

        get_specific = lambda key: SpecificSlicerSettings.from_json_data(json_data.get(key))

        return SlicerSettings(
            prusaslicer=get_specific("prusaslicer"),
            bambustudio=get_specific("bambustudio"),
            orcaslicer=get_specific("orcaslicer"),
            cura=get_specific("cura"),
            generic=GenericSlicerSettings.from_json_data(json_data.get("generic"))
        )


# ---------------------------------
# filament.json
# ---------------------------------

class SlicerIDs(IToFromJSONData):
    prusaslicer: Optional[str]
    bambustudio: Optional[str]
    orcaslicer: Optional[str]
    cura: Optional[str]

    def __init__(self,
                 prusaslicer: Optional[str] = None,
                 bambustudio: Optional[str] = None,
                 orcaslicer: Optional[str] = None,
                 cura: Optional[str] = None):
        self.prusaslicer = prusaslicer
        self.bambustudio = bambustudio
        self.orcaslicer = orcaslicer
        self.cura = cura

    def to_dict(self):
        return shallow_remove_empty(self.__dict__)

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: None = None) -> 'SlicerIDs':
        if json_data is None:
            return SlicerIDs()

        return SlicerIDs(
            prusaslicer=json_data.get("prusaslicer"),
            bambustudio=json_data.get("bambustudio"),
            orcaslicer=json_data.get("orcaslicer"),
            cura=json_data.get("cura")
        )


class Filament(IToFromFS):
    __parent: 'Material'

    name: str  # Required
    diameter_tolerance: float  # Required
    density: float  # Required
    max_dry_temperature: Optional[int]
    data_sheet_url: Optional[str]
    safety_sheet_url: Optional[str]
    discontinued: Optional[bool]
    slicer_ids: SlicerIDs
    slicer_settings: Optional[SlicerSettings]
    variants: list[FilamentVariant]  # Required

    def __init__(self,
                 parent: 'Material',
                 name: str,
                 diameter_tolerance: float,
                 density: float,
                 max_dry_temperature: Optional[int] = None,
                 data_sheet_url: Optional[str] = None,
                 safety_sheet_url: Optional[str] = None,
                 discontinued: Optional[bool] = None,
                 slicer_ids: Optional[SlicerIDs] = None,
                 slicer_settings: Optional[SlicerSettings] = None,
                 variants: Optional[list[FilamentVariant]] = None,
                 ):
        if slicer_ids is None:
            slicer_ids = SlicerIDs()
        if variants is None:
            variants = []

        self.__parent = parent
        self.name = name
        self.diameter_tolerance = diameter_tolerance
        self.density = density
        self.max_dry_temperature = max_dry_temperature
        self.data_sheet_url = data_sheet_url
        self.safety_sheet_url = safety_sheet_url
        self.discontinued = discontinued
        self.slicer_ids = slicer_ids
        self.slicer_settings = slicer_settings
        self.variants = variants

    @property
    def parent(self):
        return self.__parent

    def get_resolved_slicer_settings(self):
        """
        Get the resolved slicer_settings value
        If the parent Material has default_slicer_settings, a copy is made
        If not, a new SlicerSettings is created
        If this Filament has slicer_settings, that is used to update the copy/new SlicerSettings
        The result of these operations is returned
        """
        def_settings = self.parent.default_slicer_settings
        if def_settings is None:
            data = SlicerSettings()
        else:
            data = deepcopy(def_settings)

        if self.slicer_settings is not None:
            data.update(self.slicer_settings)

        return data

    def get_max_dry_temperature(self):
        """
        Get the correct max_dry_temperature value
        If this Filament has a max_dry_temperature value, that is returned
        Otherwise, the default_max_dry_temperature value from the parent Material is used
        """
        if self.max_dry_temperature is None:
            return self.parent.default_max_dry_temperature
        return self.max_dry_temperature

    def to_dict(self):
        return shallow_remove_empty({
            "name": self.name,
            "diameter_tolerance": self.diameter_tolerance,
            "density": self.density,
            "max_dry_temperature": self.max_dry_temperature,
            "data_sheet_url": self.data_sheet_url,
            "safety_sheet_url": self.safety_sheet_url,
            "discontinued": self.discontinued,
            "slicer_ids": self.slicer_ids.to_dict(),
            "slicer_settings": self.slicer_settings.to_dict() if self.slicer_settings else None
        })

    def to_folder(self, parent_folder: PathLike):
        path = Path(parent_folder)
        if not path.exists() or not path.is_dir():
            print(f"The provided path is not a folder: {path.__str__()}")
            return
        path = path.joinpath(cleanse_folder_name(self.name))
        path.mkdir(parents=True, exist_ok=True)
        self.to_json_file(path)
        for variant in self.variants:
            variant.to_folder(path)

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: 'Material') -> Optional['Filament']:
        if not validate_json(json_data, FILAMENT_SCHEMA):
            # An error msg will be emitted by the validate function if there is an error
            return None

        return Filament(
            parent=parent,
            name=json_data["name"],
            diameter_tolerance=json_data["diameter_tolerance"],
            density=json_data["density"],
            max_dry_temperature=json_data.get("max_dry_temperature"),
            data_sheet_url=json_data.get("data_sheet_url"),
            safety_sheet_url=json_data.get("safety_sheet_url"),
            discontinued=json_data.get("discontinued"),
            slicer_ids=SlicerIDs.from_json_data(json_data.get("slicer_ids")),
            slicer_settings=SlicerSettings.from_json_data(json_data.get("slicer_settings"))
        )

    @classmethod
    def from_folder(cls, folder_path: PathLike, parent: 'Material') -> Optional['Filament']:
        filament = super().from_folder(folder_path, parent)

        # ensure return was not None and hint the typing system
        if not isinstance(filament, Filament): return None

        entry: Path
        for entry in Path(folder_path).iterdir():
            if not entry.is_dir():
                continue
            variant = FilamentVariant.from_folder(entry, filament)
            if variant is None:
                continue
            filament.variants.append(variant)
        return filament


# ---------------------------------
# material.json
# ---------------------------------

class Material(IToFromFS):
    material_name: str  # Required
    default_max_dry_temperature: Optional[int]
    default_slicer_settings: Optional[SlicerSettings]
    filaments: list[Filament]  # Required

    def __init__(self,
                 material_name: str,
                 default_max_dry_temperature: Optional[int] = None,
                 default_slicer_settings: Optional[SlicerSettings] = None,
                 filaments: Optional[list[Filament]] = None):
        if filaments is None:
            filaments = []

        self.material_name = material_name
        self.default_max_dry_temperature = default_max_dry_temperature
        self.default_slicer_settings = default_slicer_settings
        self.filaments = filaments

    def to_dict(self):
        return shallow_remove_empty({
            "material": self.material_name,
            "default_max_dry_temperature": self.default_max_dry_temperature,
            "default_slicer_settings": self.default_slicer_settings.to_dict() if self.default_slicer_settings else None
        })

    def to_folder(self, parent_folder: PathLike):
        path = Path(parent_folder)
        if not path.exists() or not path.is_dir():
            print(f"The provided path is not a folder: {path.__str__()}")
            return
        path = path.joinpath(cleanse_folder_name(self.material_name))
        path.mkdir(parents=True, exist_ok=True)
        self.to_json_file(path)
        for filament in self.filaments:
            filament.to_folder(path)

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: None = None) -> Optional['Material']:
        if not validate_json(json_data, MATERIAL_SCHEMA):
            # An error msg will be emitted by the validate function if there is an error
            return None

        return Material(
            material_name=json_data["material"],
            default_max_dry_temperature=json_data.get("default_max_dry_temperature"),
            default_slicer_settings=SlicerSettings.from_json_data(json_data.get("default_slicer_settings"))
        )

    @classmethod
    def from_folder(cls, folder_path: PathLike, parent: None = None) -> Optional['Material']:
        material = super().from_folder(folder_path, None)

        # ensure return was not None and hint the typing system
        if not isinstance(material, Material): return None

        entry: Path
        for entry in Path(folder_path).iterdir():
            if not entry.is_dir():
                continue
            filament = Filament.from_folder(entry, material)
            if filament is None:
                continue
            material.filaments.append(filament)
        return material


# ---------------------------------
# brand.json
# ---------------------------------

class Brand(IToFromFS):
    brand_name: str
    website: str
    logo: str
    origin: str
    materials: list[Material]

    def __init__(self,
                 brand_name: str,
                 website: str,
                 logo: str,
                 origin: str,
                 materials: Optional[list[Material]] = None):
        if materials is None:
            materials = []

        self.brand_name = brand_name
        self.website = website
        self.logo = logo
        self.origin = origin
        self.materials = materials

    def to_dict(self):
        return shallow_remove_empty({
            "brand": self.brand_name,
            "logo": self.logo,
            "website": self.website,
            "origin": self.origin
        })

    def to_folder(self, parent_folder: PathLike):
        path = Path(parent_folder)
        if not path.exists() or not path.is_dir():
            print(f"The provided path is not a folder: {path.__str__()}")
            return
        path = path.joinpath(cleanse_folder_name(self.brand_name))
        path.mkdir(parents=True, exist_ok=True)
        self.to_json_file(path)
        for material in self.materials:
            material.to_folder(path)

    @staticmethod
    def from_json_data(json_data: dict[str, Any], parent: None = None) -> Optional['Brand']:
        if not validate_json(json_data, BRAND_SCHEMA):
            # An error msg will be emitted by the validate function if there is an error
            return None
        return Brand(
            brand_name=json_data["brand"],
            website=json_data["website"],
            logo=json_data["logo"],
            origin=json_data["origin"]
        )

    @classmethod
    def from_folder(cls, folder_path: PathLike, parent: None = None) -> Optional['Brand']:
        brand = super().from_folder(folder_path, None)

        # ensure return was not None and hint the typing system
        if not isinstance(brand, Brand): return None

        print(f"Attempting to import {folder_path} as a brand")

        entry: Path
        for entry in Path(folder_path).iterdir():
            if not entry.is_dir():
                continue
            print(f"Attempting to import {entry} as a material")
            material = Material.from_folder(entry)
            if material is None:
                continue
            brand.materials.append(material)
        return brand


# ---------------------------------
# Init
# ---------------------------------

# Change the CWD to the parent directory of this script
cwd = os.getcwd()
os.chdir(Path(__file__).parent)

STORE_SCHEMA = get_json_from_file("schemas/store_schema.json")
BRAND_SCHEMA = get_json_from_file("schemas/brand_schema.json")
MATERIAL_SCHEMA = get_json_from_file("schemas/material_schema.json")
FILAMENT_SCHEMA = get_json_from_file("schemas/filament_schema.json")
VARIANT_SCHEMA = get_json_from_file("schemas/variant_schema.json")
SIZE_SCHEMA = get_json_from_file("schemas/sizes_schema.json")

# Automatically load the stores on import/run
load_stores()

# Revert to previous CWD
os.chdir(cwd)
