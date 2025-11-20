const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  getFailedTests: (date, browser) => ipcRenderer.invoke('get-failed-tests', date, browser),
  getYesterdaysDiscounts: (date) => ipcRenderer.invoke('get-yesterdays-discounts', date),
  getRecentDiscounts: (date, daysBack) => ipcRenderer.invoke('get-recent-discounts', date, daysBack),
  discountTest: (testId, discountCode, discountReason) => 
    ipcRenderer.invoke('discount-test', testId, discountCode, discountReason),
  getProjectList: (env, automationType) => 
    ipcRenderer.invoke('get-project-list', env, automationType),
  getStats: (date, discounted) => ipcRenderer.invoke('get-stats', date, discounted),
  getPercentages: (date) => ipcRenderer.invoke('get-percentages', date),
  getCountStats: (date) => ipcRenderer.invoke('get-count-stats', date),
  getTestDetails: (testId) => ipcRenderer.invoke('get-test-details', testId),
  
  // Jenkins operations
  rerunTests: (tests) => ipcRenderer.invoke('rerun-tests', tests),
  runJob: (projectName, branch, env, jiraId, browser, tests) => 
    ipcRenderer.invoke('run-job', projectName, branch, env, jiraId, browser, tests),
  getJenkinsJobUrl: (project, build) => ipcRenderer.invoke('get-jenkins-job-url', project, build),
  getScreenshotUrl: (testName, project, build) => 
    ipcRenderer.invoke('get-screenshot-url', testName, project, build),
  getNightlyReruns: (date) => ipcRenderer.invoke('get-nightly-reruns', date),
  postNightlyStats: () => ipcRenderer.invoke('post-nightly-stats'),
  
  // System info
  getUsername: () => ipcRenderer.invoke('get-username'),
  
  // Database connection management
  resetDbConnection: () => ipcRenderer.invoke('reset-db-connection'),
  
  // Open external URLs
  openExternal: (url) => {
    // This will be handled by the main process
    ipcRenderer.send('open-external', url);
  },
  
  // Open URL in new Electron window
  openUrlInWindow: (url, title) => {
    ipcRenderer.send('open-url-in-window', url, title);
  },
  
  // Open job URL in window, then after 5 seconds close and open Chrome
  openJobUrlAndChrome: (buildUrl, projectUrl) => {
    ipcRenderer.send('open-job-url-and-chrome', buildUrl, projectUrl);
  },
  
  // Open test details in new Electron window
  openTestDetailsWindow: (details, test) => {
    ipcRenderer.send('open-test-details-window', details, test);
  },
  
  // Launch executable
  launchExecutable: (exePath) => {
    ipcRenderer.send('launch-executable', exePath);
  },
  
  // Get icon path
  getIconPath: () => ipcRenderer.invoke('get-icon-path')
});

