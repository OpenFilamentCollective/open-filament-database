# What to install and how to do it
In this document we'll go through what we need to install and how to do it, depending on your computer.

- [Git](#git)
- [Python](#python)
- [Python Requirements](#python-requirements)
- [NodeJS/NPM](#nodejsnpm)

## Git
You'll need git installed to be able to share your changes with us, please follow the instructions below depending on your operating system (If you're in doubt you're properly on Windows)

<details>
<summary><strong>Windows</strong></summary>

Go to https://git-scm.com/downloads and click the `Download for Windows` Button
![](img/windowsGitDownload01.png)

You'll most likely want to click on `Git for Windows/x64 Setup` on most systems as of writing
![](img/windowsGitDownload02.png)

Once the download is complete, click on the executable in the top right to start installing Git. Simply click through the setup wizard leaving all options on default.
![](img/windowsGitInstaller01.png)

Once it's done installing we'd recommend you uncheck `View Release Notes` and click finish, this will close the installer without opening a text file with info about git
![](img/windowsGitInstaller02.png)

</details>

<details>
<summary><strong>Linux</strong></summary>

- **Fedora/RHEL**
    ```bash
    sudo dnf install git
    ```
- **Debian/Ubuntu**
    ```bash
    sudo apt install git
    ```
- **Arch**
    ```bash
    sudo pacman -Syu git
    ```

</details>

<details>
<summary><strong>macOS</strong></summary>

Git *should* be preinstalled but in the case that it isn't we'd recommend installing it through [homebrew](https://brew.sh/) using the following command:
```zsh
brew install git
```

If you don't have homebrew you can also use the [latest macOS Git Installer](https://sourceforge.net/projects/git-osx-installer/files/git-2.23.0-intel-universal-mavericks.dmg/download?use_mirror=autoselect)

</details>

## Python
You'll need python to run our data validator, please follow the instructions below depending on your operating system (If you're in doubt you're properly on Windows)

<details>
<summary><strong>Windows</strong></summary>

Go to https://apps.microsoft.com/detail/9pnrbtzxmb4z?ocid=webpdpshare and click the `View in Store` button
![](img/windowsPythonDownload01.png)

Click `Open Microsoft Store` if prompted and click `Get`
![](img/windowsPythonDownload02.png)

</details>

<details>
<summary><strong>Linux</strong></summary>

- **Fedora/RHEL**
    ```bash
    sudo dnf install python
    ```
- **Debian/Ubuntu**
    ```bash
    sudo apt install python3 python3-venv
    # Optional or you'll have to replace python with python3 yourself in all commands
    sudo apt install python-is-python3
    ```
- **Arch**
    ```bash
    sudo pacman -Syu python
    ```

</details>

<details>
<summary><strong>macOS</strong></summary>

#### Homebrew (recommended)
If you've got [homebrew](https://brew.sh/) installed you can simply run:
```zsh
brew install python
```

#### Installer
Go to https://www.python.org/downloads/ and click the `Download Python` button
![](img/macOSDownloadPython.png)

Once the download is complete, double-click the package to start installing Python. The installer will walk you through a wizard to complete the installation, and in most cases, the default settings work well, so install it like the other applications on macOS. You may also have to enter your Mac password to let it know that you agree with installing Python.
![](img/macOSPythonInstall.png)

<sup>Mac Python instructions copied from https://www.dataquest.io/blog/installing-python-on-mac/</sup>

</details>

## Python Requirements

After installing Python, you need to set up a virtual environment and install the project's Python dependencies. Open a terminal/command prompt in the `open-filament-database` folder.

### Creating a Virtual Environment

<details>
<summary><strong>Windows</strong></summary>

```bash
python -m venv .venv
.venv\Scripts\activate
```

</details>

<details>
<summary><strong>Linux / macOS</strong></summary>

```bash
python3 -m venv .venv
source .venv/bin/activate
```

</details>

You'll know the virtual environment is active when you see `(.venv)` at the beginning of your command prompt.

### Installing Dependencies

With the virtual environment activated, install the requirements:

```bash
pip install -r requirements.txt
```

On some systems you may need to use `pip3` instead:
```bash
pip3 install -r requirements.txt
```

> **Note:** You'll need to activate the virtual environment each time you open a new terminal to run the validator.

## NodeJS/NPM
You'll need NodeJS to be able to run our WebUI for easy editing of the data, please follow the instructions below depending on your operating system (If you're in doubt you're properly on Windows)

<details>
<summary><strong>Windows</strong></summary>

Go to https://nodejs.org/en/download/ and click the `Windows Installer (.msi)` button
![](img/windowsNodeDownload.png)

Once the download is complete, click on the executable in the top right to start installing Node. Wait a bit for it to load and then next, you'll have to check a box and after that just click through and wait for it to finish, then click `Close`
![](img/windowsNodeInstall01.png)

</details>

<details>
<summary><strong>Linux</strong></summary>

- **Fedora/RHEL**
    ```bash
    sudo dnf install nodejs npm
    ```
- **Debian/Ubuntu**
    ```bash
    sudo apt install nodejs npm
    ```
- **Arch**
    ```bash
    sudo pacman -Syu nodejs npm
    ```

</details>

<details>
<summary><strong>macOS</strong></summary>

#### Homebrew (recommended)
If you've got [homebrew](https://brew.sh/) installed you can simply run:
```zsh
brew install node
```

#### Installer
Go to https://nodejs.org/en/download and click the `macOS Installer (.pkg)` button near the bottom of the page
![](img/macOSNodeDownload.png)

Once the download is complete, double-click the package to start installing node. The installer will walk you through a wizard to complete the installation, and in most cases, the default settings work well, so install it like the other applications on macOS. You may also have to enter your Mac password to let it know that you agree with installing node.

</details>
