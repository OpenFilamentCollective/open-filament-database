# Cloning your repository
So now we need to clone our repository, that may sound like we're gonna do like in Star Wars and create an army but sadly it's just the process of getting your cloud folder onto your computer, you can imagine this as copy pasting a folder from the cloud.

To be able to make a PR we also need to make what's called a branch after cloning, we won't be explaining this as it's require a greater understanding of git though if you're studious [here's a link](https://www.w3schools.com/git/git_branch.asp)

## Cloning on Windows
To clone your files you simply need to open a commandline window, we'll do this by holding the `windows key` and pressing `R`, this will spawn a small little windowin the bottom left with a text input, simply type in `cmd` and press `enter`.
Now, don't be scared by the hackerman window that appeared.
You now have to write or copy in the following command while replacing `YOUR_USERNAME` with you username on github
```bash
git clone https://github.com/YOUR_USERNAME/open-filament-database.git
```
press enter and let it run, when it allows you to write again you then enter the following two lines, first one will be speedy.

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

## Cloning on Linux and MacOS
Simply open you terminal and run the following to clone your repository and create a branch for your changes
```bash
git clone https://github.com/YOUR_USERNAME/open-filament-database.git
cd open-filament-database
git checkout -b YOUR_BRANCHNAME
```

Leave the terminal open and continue with [Step 5 in the README](../README.md#5-make-your-changes) to make your changes.