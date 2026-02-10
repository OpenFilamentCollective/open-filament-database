# Creating a Pull Request
Before creating a pull request, make sure you have:
1. Validated your changes (no errors should remain)
2. Sorted your data using the WebUI or `python -m ofd script style_data`
3. Pushed your changes to GitHub

## Method 1: Quick Pull Request

1. Go to the [pull requests tab](https://github.com/OpenFilamentCollective/open-filament-database/pulls) of the main database
2. If you've recently pushed changes, a yellow banner will appear
3. Click the "Compare & pull request" button
   ![](img/pullRequesting01.png)

4. You'll be brought to a page to create your pull request:
   - Change the title to describe what you've changed (e.g., "Add Elegoo Red PLA variant")
   - Write a short description explaining your changes
   ![](img/pullRequesting02.png)

5. Click "Create pull request"
6. A maintainer will review your changes and either merge them or provide feedback

## Method 2: Alternative Method
If the yellow banner doesn't appear, follow these steps:

1. Go to your GitHub profile and click on "Repositories"
   ![](img/pullRequesting03.png)

2. Search for your forked version of the database
   ![](img/pullRequesting04.png)

3. Click on the database, then click the "Pull requests" tab
   ![](img/pullRequesting05.png)

4. Click the "New Pull request" button
   ![](img/pullRequesting06.png)

5. Find and select your branch on the right side
   ![](img/pullRequesting07.png)

6. Click "Create pull request"
   ![](img/pullRequesting08.png)

7. Fill in the title and description, then click "Create pull request"
   ![](img/pullRequesting02.png)

8. Wait for a maintainer to review and merge your changes, or be ready to address any feedback!

## Using Pull Request Templates
When creating a pull request, you can use one of our templates to help structure your submission:

- **Data Addition** - Use when adding new brands, materials, filaments, variants, or stores
  - Includes checklists for validation and data quality
  - Ensures you've sorted your data before submitting

- **WebUI Changes** - Use when making changes to the web interface code
  - For developers modifying the WebUI application

To use a template, look for the "Choose a template" option when creating your PR, or find them in the `.github/PULL_REQUEST_TEMPLATE/` folder.