# QE Electron Tools

A collection of Electron-based Quality Engineering tools.

## Projects

### NightlyStats-Electron

Electron application to replace the Nightly Stats Tool Windows Forms application. Provides functionality for viewing failed tests, managing discounts, generating statistics, and integrating with Jenkins.

**Quick Start:**
```bash
cd NightlyStats-Electron
npm install
npm install electron
npm start
```

See [NightlyStats-Electron/README.md](./NightlyStats-Electron/README.md) for more details.

## Development

Each project is self-contained with its own `package.json` and dependencies. Navigate to the project directory to work with it directly.

## Scripts

From the root directory, you can use these convenience scripts:

- `npm run nightly-stats` - Start Nightly Stats app
- `npm run nightly-stats:dev` - Start Nightly Stats app in dev mode
- `npm run nightly-stats:build` - Build Nightly Stats app

