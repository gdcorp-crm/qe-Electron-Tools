# Nightly Stats Electron App

An Electron application to replace the Windows Forms Nightly Stats Tool. This application provides a modern, cross-platform interface for managing nightly test statistics, discounting tests, and generating reports.

## Features

- **Failed Tests Management**: View and filter failed tests from nightly runs
- **Test Discounting**: Mark tests as discounted with reasons and codes
- **Stats Generation**: Generate nightly statistics reports
- **Count Stats**: Check test count accuracy
- **Jenkins Integration**: Rerun tests and trigger Jenkins jobs
- **Test Details**: View detailed information about test failures
- **Screenshot Access**: Open test failure screenshots for UI tests

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Access to the CRM database
- Jenkins API token

## Installation

1. Clone the repository or navigate to the `NightlyStats-Electron` directory

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update the `.env` file with your credentials:
```
care-plat-qe=your_database_password
JenkinsToken=your_jenkins_token
```

**Note**: On Windows, the environment variable name should match the database username (`care-plat-qe`). If that doesn't work, you can also use:
```
CARE_PLAT_QE_PASSWORD=your_database_password
```
or
```
DB_PASSWORD=your_database_password
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Building the Application

To build a distributable package:

```bash
npm run build
```

This will create platform-specific installers in the `dist` directory.

## Usage

### Viewing Failed Tests

1. Select a run date (defaults to yesterday, or Friday if today is Monday)
2. Use filters to narrow down the list:
   - Environment (TEST, PROD, A2)
   - Project Name
   - Automation Type (UI, API)
   - Browser
   - Owner
   - Not Discounted Only checkbox

### Discounting Tests

1. Select one or more tests from the failed tests table
2. Choose a discount code from the dropdown
3. Enter a discount reason (required for all codes except "Clear Discount")
4. Click "Discount Selected Tests"

### Copying Discounts

1. Click "Get Previous Day's Discounts" to load yesterday's discounted tests
2. Select tests from the discounts table
3. Click "Copy Discounts For Selected" to apply the same discounts to today's matching tests

### Generating Stats

1. Click "Generate Nightly Stats" to create a formatted stats report
2. Click "Copy Stats" to copy the report to clipboard
3. Use "Generate Count Stats" to check for count discrepancies

### Rerunning Tests

1. Select one or more tests from the failed tests table
2. Click "Rerun Selected Test(s)" to trigger a Jenkins rerun
3. The Jenkins job page will open automatically

### Running Custom Jobs

1. Fill in the "Run Dev or Regression Job" form:
   - Select project
   - Choose branch (dev/main)
   - Select environment
   - Enter Jira ID
   - Optionally select browser and specific tests
2. Click "Run Tests" to trigger the job

## Project Structure

```
NightlyStats-Electron/
├── main.js                 # Main Electron process
├── preload.js              # Preload script for secure IPC
├── index.html              # Main UI
├── styles.css              # Application styles
├── renderer.js             # UI logic and event handlers
├── services/
│   ├── dbService.js        # Database operations
│   └── jenkinsService.js   # Jenkins API integration
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

## Database Connection

The application connects to:
- Server: `ls.crm.mssql.int.test-godaddy.com`
- Database: `CRM`
- User: `care-plat-qe`
- Password: Set in `.env` file

## Jenkins Integration

The application integrates with Jenkins at:
- Base URL: `https://echoqa.jenkins.int.godaddy.com`
- Authentication: Basic Auth using Windows username and Jenkins token

## Troubleshooting

### Database Connection Issues
- Verify your database password in the `.env` file
- Check network connectivity to the database server
- Ensure the `care-plat-qe` user has proper permissions

### Jenkins API Issues
- Verify your Jenkins token in the `.env` file
- Check that your Windows username matches your Jenkins account
- Ensure you have permissions to trigger builds

### Application Won't Start
- Verify all dependencies are installed: `npm install`
- Check Node.js version (requires v16+)
- Review console for error messages

## Development

### Adding New Features

1. Add IPC handlers in `main.js` for new functionality
2. Expose methods in `preload.js` for renderer access
3. Implement UI in `renderer.js` and `index.html`
4. Add backend logic in appropriate service file

### Code Style

- Use ES6+ JavaScript features
- Follow existing code patterns
- Add error handling for all async operations
- Use meaningful variable and function names

## License

Internal use only - GoDaddy

## Support

For issues or questions, contact the QA team.

