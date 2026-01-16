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

# Import all scripts to register them
from . import style_data
from . import load_profiles
from . import export_data

__all__ = ['style_data', 'load_profiles', 'export_data']
