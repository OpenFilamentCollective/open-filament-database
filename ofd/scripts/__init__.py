"""
OFD Scripts Package.

This package contains utility scripts that can be run via 'ofd script <name>'.
Scripts should extend BaseScript and use the @register_script decorator.

Example:
    from ofd.base import BaseScript, ScriptResult, register_script

    @register_script
    class MyScript(BaseScript):
        name = "my_script"
        description = "Does something useful"

        def configure_parser(self, parser):
            parser.add_argument('--my-arg', help='My argument')

        def run(self, args) -> ScriptResult:
            # Do work here
            return ScriptResult(success=True, message="Done!")
"""

import importlib
import pkgutil

# Automatically import all modules in this package to register scripts
__all__ = []
for importer, modname, ispkg in pkgutil.iter_modules(__path__):
    if not ispkg:
        importlib.import_module(f'.{modname}', __package__)
        __all__.append(modname)