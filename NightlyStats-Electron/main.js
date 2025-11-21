const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const dbService = require('./services/dbService');
const jenkinsService = require('./services/jenkinsService');

let mainWindow;

function createWindow() {
  // Try Resources folder first, then fallback to assets folder
  const iconPath = fs.existsSync(path.join(__dirname, 'Resources', 'NightlyStats.ico'))
    ? path.join(__dirname, 'Resources', 'NightlyStats.ico')
    : path.join(__dirname, 'assets', 'icon.png');
  
  const windowOptions = {
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  };
  
  // Only set icon if it exists
  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }
  
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('index.html');
  
  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Launch executable
ipcMain.on('launch-executable', (event, exePath) => {
  exec(`"${exePath}"`, (error) => {
    if (error) {
      console.error(`Error launching executable: ${error.message}`);
    }
  });
});

// Get icon path
ipcMain.handle('get-icon-path', () => {
  const iconPath = fs.existsSync(path.join(__dirname, 'Resources', 'NightlyStats.ico'))
    ? path.join(__dirname, 'Resources', 'NightlyStats.ico')
    : (fs.existsSync(path.join(__dirname, 'assets', 'icon.png'))
      ? path.join(__dirname, 'assets', 'icon.png')
      : null);
  
  if (iconPath) {
    // Return as file:// URL for use in HTML
    return `file:///${iconPath.replace(/\\/g, '/')}`;
  }
  return null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for database operations
ipcMain.handle('get-failed-tests', async (event, date, browser) => {
  try {
    return await dbService.getFailedTests(date, browser);
  } catch (error) {
    console.error('Error getting failed tests:', error);
    throw error;
  }
});

ipcMain.handle('get-yesterdays-discounts', async (event, date) => {
  try {
    return await dbService.getYesterdaysDiscounts(date);
  } catch (error) {
    console.error('Error getting yesterday\'s discounts:', error);
    throw error;
  }
});

ipcMain.handle('get-recent-discounts', async (event, date, daysBack) => {
  try {
    return await dbService.getRecentDiscounts(date, daysBack);
  } catch (error) {
    console.error('Error getting recent discounts:', error);
    throw error;
  }
});

ipcMain.handle('discount-test', async (event, testId, discountCode, discountReason) => {
  try {
    return await dbService.discountTest(testId, discountCode, discountReason);
  } catch (error) {
    console.error('Error discounting test:', error);
    throw error;
  }
});

ipcMain.handle('get-project-list', async (event, env, automationType) => {
  try {
    return await dbService.getProjectList(env, automationType);
  } catch (error) {
    console.error('Error getting project list:', error);
    throw error;
  }
});

ipcMain.handle('get-stats', async (event, date, discounted) => {
  try {
    return await dbService.getStats(date, discounted);
  } catch (error) {
    console.error('Error getting stats:', error);
    throw error;
  }
});

ipcMain.handle('get-percentages', async (event, date) => {
  try {
    return await dbService.getPercentages(date);
  } catch (error) {
    console.error('Error getting percentages:', error);
    throw error;
  }
});

ipcMain.handle('get-count-stats', async (event, date) => {
  try {
    return await dbService.getCountStats(date);
  } catch (error) {
    console.error('Error getting count stats:', error);
    throw error;
  }
});

ipcMain.handle('get-test-details', async (event, testId) => {
  try {
    return await dbService.getTestDetails(testId);
  } catch (error) {
    console.error('Error getting test details:', error);
    throw error;
  }
});

// IPC handlers for Jenkins operations
ipcMain.handle('rerun-tests', async (event, tests) => {
  try {
    return await jenkinsService.rerunTests(tests);
  } catch (error) {
    console.error('Error rerunning tests:', error);
    throw error;
  }
});

ipcMain.handle('run-job', async (event, projectName, branch, env, jiraId, browser, tests) => {
  try {
    return await jenkinsService.runJob(projectName, branch, env, jiraId, browser, tests);
  } catch (error) {
    console.error('Error running job:', error);
    throw error;
  }
});

ipcMain.handle('get-jenkins-job-url', async (event, project, build) => {
  try {
    return jenkinsService.getJobUrl(project, build);
  } catch (error) {
    console.error('Error getting Jenkins job URL:', error);
    throw error;
  }
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('open-url-in-window', (event, url, title) => {
  let screenshotWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: title || 'Screenshot'
  });

  screenshotWindow.loadURL(url);
  
  screenshotWindow.on('closed', () => {
    screenshotWindow = null;
  });
});

function escapeHtmlForWindow(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

ipcMain.on('open-test-details-window', (event, details, test) => {
  let testDetailsWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: `Test Details - ${test.testName}`
  });

  // Create HTML content for test details
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Test Details - ${escapeHtmlForWindow(test.testName)}</title>
      <style>
        :root {
          --bg-primary: #f5f5f5;
          --bg-secondary: white;
          --text-primary: #333;
          --text-secondary: #555;
          --border-color: #ddd;
          --border-accent: #3498db;
          --shadow: rgba(0,0,0,0.1);
          --btn-primary: #3498db;
          --btn-primary-hover: #2980b9;
        }
        
        @media (prefers-color-scheme: dark) {
          :root {
            --bg-primary: #1a1a1a;
            --bg-secondary: #2d2d2d;
            --text-primary: #e0e0e0;
            --text-secondary: #b0b0b0;
            --border-color: #444;
            --border-accent: #4a9eff;
            --shadow: rgba(0,0,0,0.3);
            --btn-primary: #4a9eff;
            --btn-primary-hover: #357abd;
          }
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 20px;
          background-color: var(--bg-primary);
          color: var(--text-primary);
          transition: background-color 0.3s ease, color 0.3s ease;
        }
        .detail-row {
          margin-bottom: 15px;
          padding: 10px;
          background-color: var(--bg-secondary);
          border-radius: 4px;
          box-shadow: 0 1px 3px var(--shadow);
          transition: background-color 0.3s ease;
        }
        .detail-label {
          font-weight: bold;
          color: var(--text-secondary);
          margin-bottom: 5px;
        }
        .detail-value {
          color: var(--text-primary);
          word-wrap: break-word;
        }
        textarea {
          width: 100%;
          min-height: 100px;
          padding: 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          resize: vertical;
          background-color: var(--bg-secondary);
          color: var(--text-primary);
          transition: background-color 0.3s ease, border-color 0.3s ease;
        }
        textarea:focus {
          outline: none;
          border-color: var(--border-accent);
        }
        .action-buttons {
          margin-top: 20px;
          display: flex;
          gap: 10px;
        }
        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
          background-color: var(--btn-primary);
          color: white;
          transition: background-color 0.3s ease;
        }
        .btn:hover {
          background-color: var(--btn-primary-hover);
        }
      </style>
    </head>
    <body>
      <h2>Test Details</h2>
      <div class="detail-row">
        <div class="detail-label">Test Name:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.testName)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Project Name:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.projectName)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Environment:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.env)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Result:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.result)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Build Number:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.buildNumber)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Error Message:</div>
        <textarea readonly>${escapeHtmlForWindow(details.errorMsg || '')}</textarea>
      </div>
      <div class="detail-row">
        <div class="detail-label">Stack Trace:</div>
        <textarea readonly>${escapeHtmlForWindow(details.stackTrace || '')}</textarea>
      </div>
      <div class="detail-row">
        <div class="detail-label">Browser:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.browser || 'N/A')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Discount:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.discount || 'None')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Discount Reason:</div>
        <div class="detail-value">${escapeHtmlForWindow(details.discReason || '')}</div>
      </div>
      <div class="action-buttons">
        <button class="btn" onclick="window.open('https://echoqa.jenkins.int.godaddy.com/job/${escapeHtmlForWindow(details.projectName)}/${escapeHtmlForWindow(details.buildNumber)}/', '_blank')">Open Jenkins Job</button>
      </div>
    </body>
    </html>
  `;

  testDetailsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  
  testDetailsWindow.on('closed', () => {
    testDetailsWindow = null;
  });
});

ipcMain.on('open-job-url-and-chrome', (event, buildUrl, projectUrl) => {
  // Open the build URL in a new Electron window
  let jobWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'Jenkins Job'
  });

  jobWindow.loadURL(buildUrl);
  
  // Handle page load errors
  jobWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    const errorMessage = `Error ${errorCode}: ${errorDescription}`;
    if (jobWindow && !jobWindow.isDestroyed()) {
      jobWindow.setTitle(`Jenkins Job - ${buildUrl} - ${errorMessage}`);
      // Wait a moment to show the error, then close and open Chrome
      setTimeout(() => {
        if (jobWindow && !jobWindow.isDestroyed()) {
          jobWindow.close();
        }
        shell.openExternal(projectUrl);
      }, 2000);
    }
  });
  
  // Wait for page to finish loading, then wait 2 seconds and check content
  jobWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (jobWindow && !jobWindow.isDestroyed()) {
        // Check if the page has text content and look for error messages
        jobWindow.webContents.executeJavaScript(`
          (function() {
            const bodyText = document.body ? document.body.innerText || document.body.textContent : '';
            const hasText = bodyText.trim().length > 0;
            
            // Look for common error indicators
            let errorText = '';
            if (hasText) {
              const errorSelectors = [
                'h1', 'h2', '.error', '.alert', '.alert-danger', 
                '[class*="error"]', '[class*="Error"]', '[id*="error"]'
              ];
              
              for (const selector of errorSelectors) {
                try {
                  const elements = document.querySelectorAll(selector);
                  for (const el of elements) {
                    const text = el.innerText || el.textContent || '';
                    if (text.trim().length > 0 && text.length < 200) {
                      errorText = text.trim();
                      break;
                    }
                  }
                  if (errorText) break;
                } catch (e) {}
              }
              
              // If no specific error found, check if body text looks like an error
              if (!errorText && bodyText.length < 500) {
                const lowerText = bodyText.toLowerCase();
                if (lowerText.includes('error') || lowerText.includes('failed') || 
                    lowerText.includes('exception') || lowerText.includes('not found')) {
                  errorText = bodyText.substring(0, 100).trim();
                }
              }
            }
            
            return { hasText, errorText };
          })();
        `).then((result) => {
          if (!result.hasText) {
            // Page is blank, close window and open Chrome
            if (jobWindow && !jobWindow.isDestroyed()) {
              jobWindow.close();
            }
            
            // Open Chrome with the project URL
            const chromePaths = [
              'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
              process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
            ];
            
            let chromeFound = false;
            for (const chromePath of chromePaths) {
              if (fs.existsSync(chromePath)) {
                exec(`"${chromePath}" "${projectUrl}"`, (error) => {
                  if (error) {
                    console.error('Error opening Chrome:', error);
                    // Fallback to default browser
                    shell.openExternal(projectUrl);
                  }
                });
                chromeFound = true;
                break;
              }
            }
            
            if (!chromeFound) {
              // Fallback to default browser if Chrome not found
              shell.openExternal(projectUrl);
            }
          } else {
            // Page has text content, update window title to include the URL and any error
            if (jobWindow && !jobWindow.isDestroyed()) {
              let title = `Jenkins Job - ${buildUrl}`;
              if (result.errorText) {
                title += ` - Error: ${result.errorText}`;
              }
              jobWindow.setTitle(title);
            }
          }
        }).catch((error) => {
          console.error('Error checking page content:', error);
          const errorMessage = error.message || error.toString();
          // On error, show error in title before closing
          if (jobWindow && !jobWindow.isDestroyed()) {
            jobWindow.setTitle(`Jenkins Job - ${buildUrl} - Error: ${errorMessage}`);
            setTimeout(() => {
              if (jobWindow && !jobWindow.isDestroyed()) {
                jobWindow.close();
              }
              shell.openExternal(projectUrl);
            }, 2000);
          } else {
            shell.openExternal(projectUrl);
          }
        });
      }
    }, 2000); // Wait 2 seconds after page loads
  });
  
  jobWindow.on('closed', () => {
    jobWindow = null;
  });
});

ipcMain.handle('get-screenshot-url', async (event, testName, project, build) => {
  try {
    return await jenkinsService.getScreenshotUrl(testName, project, build);
  } catch (error) {
    console.error('Error getting screenshot URL:', error);
    throw error;
  }
});

ipcMain.handle('get-nightly-reruns', async (event, date) => {
  try {
    return await jenkinsService.getNightlyReruns(date);
  } catch (error) {
    console.error('Error getting nightly reruns:', error);
    throw error;
  }
});

ipcMain.handle('post-nightly-stats', async () => {
  try {
    return await jenkinsService.postNightlyStats();
  } catch (error) {
    console.error('Error posting nightly stats:', error);
    throw error;
  }
});

ipcMain.handle('get-username', async () => {
  return process.env.USERNAME || process.env.USER || 'unknown';
});

ipcMain.handle('reset-db-connection', async () => {
  try {
    // Reset the database connection pool
    await dbService.resetConnection();
    return { success: true };
  } catch (error) {
    console.error('Error resetting database connection:', error);
    throw error;
  }
});

