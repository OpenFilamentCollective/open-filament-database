# Validation of your files
To make sure all your files are correct we need to run some code on them to check, for this you need python which if you haven't installed yet [can be found how to here](installing-software.md#python).
After you've got python installed you can go back to the open-filament-database folder, assuming just used the WebUI, by writting
```bash
cd ..
```
And then running the following depending on platform, if any text appears that between pressing enter and being able to input another command read through it and see if you can fix it.

### Windows
```bash
python.exe data_validator.py --folder-names # Validates folder names.
python.exe data_validator.py --logo-files # Validates logo files.
python.exe data_validator.py --json-files # Validates json files.
python.exe data_validator.py --store-ids # Validates store ids.
```

### Linux/macos
```bash
python data_validator.py --folder-names # Validates folder names.
python data_validator.py --logo-files # Validates logo files.
python data_validator.py --json-files # Validates json files.
python data_validator.py --store-ids # Validates store ids.
```
if this gives an error about `python` not being installed try replacing every instance of `python` with `python3`
```bash
python3 data_validator.py --folder-names # Validates folder names.
python3 data_validator.py --logo-files # Validates logo files.
python3 data_validator.py --json-files # Validates json files.
python3 data_validator.py --store-ids # Validates store ids.
```
