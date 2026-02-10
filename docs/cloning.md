# Cloning Your Repository
Now we need to clone your repository. "Cloning" is the process of downloading your forked copy from GitHub to your computer - think of it as copying a folder from the cloud to your local machine.

After cloning, we'll create a "branch" for your changes. Branches allow you to work on changes without affecting the main codebase. If you're curious about how branches work, [here's a helpful guide](https://www.w3schools.com/git/git_branch.asp).

## Cloning on Windows
To clone your files, you need to open a command line window:
1. Hold the `Windows key` and press `R`
2. A small window will appear in the bottom left with a text input
3. Type `cmd` and press `Enter`

A black terminal window will appear. Now type or paste the following command, replacing `YOUR_USERNAME` with your GitHub username:
```bash
git clone https://github.com/YOUR_USERNAME/open-filament-database.git
```
Press `Enter` and let it run. When it finishes and you can type again, enter the following two commands:

**Remember to replace YOUR_BRANCHNAME with a descriptive name for your changes.**
Use lowercase with hyphens, for example:
- Adding a new red variant to Elegoo's PLA: `add-elegoo-red-pla`
- Updating Bambu Lab PETG prices: `update-bambulab-petg-prices`
- Adding a new brand: `add-sunlu-brand`

```bash
cd open-filament-database
git checkout -b YOUR_BRANCHNAME
```

Leave the window open and continue with [Step 5 in the README](../README.md#5-make-your-changes) to make your changes.

## Cloning on Linux and macOS
Open your terminal and run the following commands to clone your repository and create a branch for your changes:
```bash
git clone https://github.com/YOUR_USERNAME/open-filament-database.git
cd open-filament-database
git checkout -b YOUR_BRANCHNAME
```

Leave the terminal open and continue with [Step 5 in the README](../README.md#5-make-your-changes) to make your changes.