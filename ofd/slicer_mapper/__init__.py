"""
ofd.slicer_mapper — Link filament data to slicer profiles.

Maps OFD filament entries to their corresponding slicer profile base names
by matching brand/material/name patterns against the profile store index.
"""

from .mapper import SlicerMapper, MappingResult, MappingConflict, MappingReport

__all__ = [
    "SlicerMapper",
    "MappingResult",
    "MappingConflict",
    "MappingReport",
]
