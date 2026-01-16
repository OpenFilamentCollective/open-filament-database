"""
Validation orchestrator for OFD CLI.

This module contains the ValidationOrchestrator class that coordinates
all validation tasks with optional multiprocessing support.
"""

import json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional

from .types import ValidationError, ValidationLevel, ValidationResult, ValidationTask
from .validators import (
    SchemaCache,
    JsonValidator,
    LogoValidator,
    FolderNameValidator,
    StoreIdValidator,
    GTINValidator,
    MissingFileValidator,
    load_json,
)


def _execute_validation_task(task: ValidationTask) -> ValidationResult:
    """
    Worker function to execute a validation task.
    This is a module-level function so it can be pickled for multiprocessing.
    """
    schema_cache = SchemaCache()
    extra = task.extra_data or {}

    if task.task_type == 'json':
        validator = JsonValidator(schema_cache)
        schema_name = extra.get('schema_name', '')
        return validator.validate_json_file(task.path, schema_name)

    elif task.task_type == 'logo':
        validator = LogoValidator(schema_cache)
        logo_name = extra.get('logo_name')
        return validator.validate_logo_file(task.path, logo_name)

    elif task.task_type == 'folder':
        validator = FolderNameValidator(schema_cache)
        json_file = extra.get('json_file', '')
        json_key = extra.get('json_key', '')
        return validator.validate_folder_name(task.path, json_file, json_key)

    else:
        result = ValidationResult()
        result.add_error(ValidationError(
            level=ValidationLevel.ERROR,
            category="System",
            message=f"Unknown task type: {task.task_type}"
        ))
        return result


def collect_json_validation_tasks(data_dir: Path, stores_dir: Path) -> List[ValidationTask]:
    """Collect all JSON validation tasks."""
    tasks = []

    # Brand validation tasks
    for brand_dir in data_dir.iterdir():
        if not brand_dir.is_dir():
            continue

        brand_file = brand_dir / "brand.json"
        if brand_file.exists():
            tasks.append(ValidationTask(
                task_type='json',
                name=f"Brand JSON: {brand_dir.name}",
                path=brand_file,
                extra_data={'schema_name': 'brand'}
            ))

        # Material validation tasks
        for material_dir in brand_dir.iterdir():
            if not material_dir.is_dir():
                continue

            material_file = material_dir / "material.json"
            if material_file.exists():
                tasks.append(ValidationTask(
                    task_type='json',
                    name=f"Material JSON: {material_dir.name}",
                    path=material_file,
                    extra_data={'schema_name': 'material'}
                ))

            # Filament validation tasks
            for filament_dir in material_dir.iterdir():
                if not filament_dir.is_dir():
                    continue

                filament_file = filament_dir / "filament.json"
                if filament_file.exists():
                    tasks.append(ValidationTask(
                        task_type='json',
                        name=f"Filament JSON: {filament_dir.name}",
                        path=filament_file,
                        extra_data={'schema_name': 'filament'}
                    ))

                # Variant validation tasks
                for variant_dir in filament_dir.iterdir():
                    if not variant_dir.is_dir():
                        continue

                    variant_file = variant_dir / "variant.json"
                    if variant_file.exists():
                        tasks.append(ValidationTask(
                            task_type='json',
                            name=f"Variant JSON: {variant_dir.name}",
                            path=variant_file,
                            extra_data={'schema_name': 'variant'}
                        ))

                    sizes_file = variant_dir / "sizes.json"
                    if sizes_file.exists():
                        tasks.append(ValidationTask(
                            task_type='json',
                            name=f"Sizes JSON: {variant_dir.name}",
                            path=sizes_file,
                            extra_data={'schema_name': 'sizes'}
                        ))

    # Store validation tasks
    for store_dir in stores_dir.iterdir():
        if not store_dir.is_dir():
            continue

        store_file = store_dir / "store.json"
        if store_file.exists():
            tasks.append(ValidationTask(
                task_type='json',
                name=f"Store JSON: {store_dir.name}",
                path=store_file,
                extra_data={'schema_name': 'store'}
            ))

    return tasks


def collect_logo_validation_tasks(data_dir: Path, stores_dir: Path) -> List[ValidationTask]:
    """Collect all logo validation tasks."""
    tasks = []

    # Brand logos
    for brand_dir in data_dir.iterdir():
        if not brand_dir.is_dir():
            continue

        brand_file = brand_dir / "brand.json"
        if brand_file.exists():
            data = load_json(brand_file)
            if data and "logo" in data:
                logo_name = data["logo"]
                logo_path = brand_dir / logo_name
                tasks.append(ValidationTask(
                    task_type='logo',
                    name=f"Brand Logo: {brand_dir.name}",
                    path=logo_path,
                    extra_data={'logo_name': logo_name}
                ))

    # Store logos
    for store_dir in stores_dir.iterdir():
        if not store_dir.is_dir():
            continue

        store_file = store_dir / "store.json"
        if store_file.exists():
            data = load_json(store_file)
            if data and "logo" in data:
                logo_name = data["logo"]
                logo_path = store_dir / logo_name
                tasks.append(ValidationTask(
                    task_type='logo',
                    name=f"Store Logo: {store_dir.name}",
                    path=logo_path,
                    extra_data={'logo_name': logo_name}
                ))

    return tasks


def collect_folder_validation_tasks(data_dir: Path, stores_dir: Path) -> List[ValidationTask]:
    """Collect all folder name validation tasks."""
    tasks = []

    # Brand folders
    for brand_dir in data_dir.iterdir():
        if not brand_dir.is_dir():
            continue

        tasks.append(ValidationTask(
            task_type='folder',
            name=f"Brand Folder: {brand_dir.name}",
            path=brand_dir,
            extra_data={'json_file': 'brand.json', 'json_key': 'id'}
        ))

        # Material folders
        for material_dir in brand_dir.iterdir():
            if not material_dir.is_dir():
                continue

            tasks.append(ValidationTask(
                task_type='folder',
                name=f"Material Folder: {material_dir.name}",
                path=material_dir,
                extra_data={'json_file': 'material.json', 'json_key': 'material'}
            ))

            # Filament folders
            for filament_dir in material_dir.iterdir():
                if not filament_dir.is_dir():
                    continue

                tasks.append(ValidationTask(
                    task_type='folder',
                    name=f"Filament Folder: {filament_dir.name}",
                    path=filament_dir,
                    extra_data={'json_file': 'filament.json', 'json_key': 'id'}
                ))

                # Variant folders
                for variant_dir in filament_dir.iterdir():
                    if not variant_dir.is_dir():
                        continue

                    tasks.append(ValidationTask(
                        task_type='folder',
                        name=f"Variant Folder: {variant_dir.name}",
                        path=variant_dir,
                        extra_data={'json_file': 'variant.json', 'json_key': 'id'}
                    ))

    # Store folders
    for store_dir in stores_dir.iterdir():
        if not store_dir.is_dir():
            continue

        tasks.append(ValidationTask(
            task_type='folder',
            name=f"Store Folder: {store_dir.name}",
            path=store_dir,
            extra_data={'json_file': 'store.json', 'json_key': 'id'}
        ))

    return tasks


class ValidationOrchestrator:
    """Orchestrates all validation tasks with multiprocessing support."""

    def __init__(self, data_dir: Path = Path("./data"),
                 stores_dir: Path = Path("./stores"),
                 max_workers: Optional[int] = None,
                 progress_mode: bool = False):
        self.data_dir = data_dir
        self.stores_dir = stores_dir
        self.max_workers = max_workers
        self.schema_cache = SchemaCache()
        self.progress_mode = progress_mode

    def emit_progress(self, stage: str, percent: int, message: str = '') -> None:
        """Emit progress event as JSON to stdout for SSE streaming."""
        if self.progress_mode and hasattr(sys.stdout, 'isatty') and not sys.stdout.isatty():
            # Only emit when stdout is piped (not terminal)
            print(json.dumps({
                'type': 'progress',
                'stage': stage,
                'percent': percent,
                'message': message
            }), flush=True)

    def run_tasks_parallel(self, tasks: List[ValidationTask]) -> ValidationResult:
        """Run validation tasks in parallel using process pool."""
        result = ValidationResult()

        if not tasks:
            return result

        with ProcessPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_task = {executor.submit(_execute_validation_task, task): task for
                              task in tasks}

            for future in as_completed(future_to_task):
                task = future_to_task[future]
                try:
                    task_result = future.result()
                    result.merge(task_result)
                except Exception as e:
                    result.add_error(ValidationError(
                        level=ValidationLevel.ERROR,
                        category="System",
                        message=f"Task '{task.name}' failed with exception: {str(e)}"
                    ))

        return result

    def validate_json_files(self) -> ValidationResult:
        """Validate all JSON files against schemas."""
        if not self.progress_mode:
            print("Collecting JSON validation tasks...")
        tasks = collect_json_validation_tasks(self.data_dir, self.stores_dir)
        if not self.progress_mode:
            print(f"Running {len(tasks)} JSON validation tasks...")
        return self.run_tasks_parallel(tasks)

    def validate_logo_files(self) -> ValidationResult:
        """Validate all logo files."""
        if not self.progress_mode:
            print("Collecting logo validation tasks...")
        tasks = collect_logo_validation_tasks(self.data_dir, self.stores_dir)
        if not self.progress_mode:
            print(f"Running {len(tasks)} logo validation tasks...")
        return self.run_tasks_parallel(tasks)

    def validate_folder_names(self) -> ValidationResult:
        """Validate all folder names."""
        if not self.progress_mode:
            print("Collecting folder name validation tasks...")
        tasks = collect_folder_validation_tasks(self.data_dir, self.stores_dir)
        if not self.progress_mode:
            print(f"Running {len(tasks)} folder name validation tasks...")
        return self.run_tasks_parallel(tasks)

    def validate_store_ids(self) -> ValidationResult:
        """Validate store IDs."""
        if not self.progress_mode:
            print("Validating store IDs...")
        validator = StoreIdValidator(self.schema_cache)
        return validator.validate_store_ids(self.data_dir, self.stores_dir)

    def validate_gtin(self) -> ValidationResult:
        """Validate GTIN/EAN rules."""
        if not self.progress_mode:
            print("Validating GTIN/EAN...")
        validator = GTINValidator(self.schema_cache)
        return validator.validate_gtin_ean(self.data_dir)

    def validate_all(self) -> ValidationResult:
        """Run all validations."""
        result = ValidationResult()

        # Check for missing files first
        self.emit_progress('missing_files', 0, 'Checking for missing required files...')
        if not self.progress_mode:
            print("Checking for missing required files...")
        validator = MissingFileValidator(self.schema_cache)
        result.merge(validator.validate_required_files(self.data_dir, self.stores_dir))
        self.emit_progress('missing_files', 100, 'Missing files check complete')

        self.emit_progress('json_files', 0, 'Validating JSON files...')
        result.merge(self.validate_json_files())
        self.emit_progress('json_files', 100, 'JSON validation complete')

        self.emit_progress('logo_files', 0, 'Validating logo files...')
        result.merge(self.validate_logo_files())
        self.emit_progress('logo_files', 100, 'Logo validation complete')

        self.emit_progress('folder_names', 0, 'Validating folder names...')
        result.merge(self.validate_folder_names())
        self.emit_progress('folder_names', 100, 'Folder name validation complete')

        self.emit_progress('store_ids', 0, 'Validating store IDs...')
        result.merge(self.validate_store_ids())
        self.emit_progress('store_ids', 100, 'Store ID validation complete')

        self.emit_progress('gtin', 0, 'Validating GTIN/EAN...')
        result.merge(self.validate_gtin())
        self.emit_progress('gtin', 100, 'GTIN/EAN validation complete')

        return result
