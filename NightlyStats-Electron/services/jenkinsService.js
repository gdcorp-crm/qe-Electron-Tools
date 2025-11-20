const axios = require('axios');
const { shell } = require('electron');
require('dotenv').config();

const JENKINS_BASE_URL = 'https://echoqa.jenkins.int.godaddy.com';
const JENKINS_TOKEN = process.env.JenkinsToken || '';

function getAuthHeader() {
  const username = process.env.USERNAME || 'unknown';
  const token = JENKINS_TOKEN;
  const auth = Buffer.from(`${username}:${token}`).toString('base64');
  return `Basic ${auth}`;
}

function getJobUrl(project, build) {
  return `${JENKINS_BASE_URL}/job/${project}/${build}/`;
}

async function rerunTests(tests) {
  // Group tests by project, env, and build
  if (!tests || tests.length === 0) {
    throw new Error('No tests selected');
  }
  
  const firstTest = tests[0];
  const project = firstTest.project;
  const env = firstTest.env;
  const build = firstTest.buildNo;
  const type = firstTest.type;
  const browser = firstTest.browser;
  
  // Verify all tests are from same project/env/build
  const allSame = tests.every(test => 
    test.project === project && 
    test.env === env && 
    test.buildNo === build
  );
  
  if (!allSame) {
    throw new Error('All selected tests must be from the same project, environment, and build');
  }
  
  // Get Jira ID from original job
  let jiraId = '';
  try {
    jiraId = await getJiraIdFromJob(project, build);
  } catch (error) {
    console.warn('Could not get Jira ID:', error);
  }
  
  // Build test list
  const testList = tests.map(t => t.testName);
  let testQueryString = '';
  
  if (project.includes('v2')) {
    testQueryString = `&Tests=${testList.join('%2C')}`;
  } else {
    testQueryString = `&Test=${testList.join('%20%2Ftest%3A')}`;
  }
  
  // Build browser query string for UI jobs
  let browserQueryString = '';
  if (type === 'ui' && browser) {
    browserQueryString = `&Browser=${browser}`;
  }
  
  // Build retry URL
  const retryUrl = `${JENKINS_BASE_URL}/job/${project}/buildWithParameters?token=crmftw&crmUser=&JobType=Nightly&Retry=true&ENV=${env}&PreviousBuildNo=${build}${browserQueryString}${testQueryString}`;
  
  if (jiraId) {
    retryUrl += `&JiraID=${jiraId}`;
  }
  
  // Extract the path for the API call
  const url = new URL(retryUrl);
  const path = url.pathname + url.search;
  const projectUrl = `${JENKINS_BASE_URL}/job/${project}`;
  
  try {
    const response = await axios.post(
      `${JENKINS_BASE_URL}${path}`,
      {},
      {
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json'
        },
        timeout: 5000,
        validateStatus: () => true
      }
    );
    
    if (response.status !== 201) {
      // Retry a few times if job is already running
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        const running = await checkForRunningJob(project);
        if (running) {
          break;
        }
        const retryResponse = await axios.post(
          `${JENKINS_BASE_URL}${path}`,
          {},
          {
            headers: {
              'Authorization': getAuthHeader(),
              'Content-Type': 'application/json'
            },
            timeout: 5000,
            validateStatus: () => true
          }
        );
        if (retryResponse.status === 201) {
          break;
        }
      }
    }
    
    // Open Jenkins job page
    shell.openExternal(projectUrl);
    
    return { success: true, url: projectUrl };
  } catch (error) {
    console.error('Error rerunning tests:', error);
    throw error;
  }
}

async function runJob(projectName, branch, env, jiraId, browser, tests) {
  let queryString = `&Branch=${branch}&ENV=${env}&JiraID=${jiraId || ''}`;
  
  if (browser) {
    queryString += `&Browser=${browser}`;
  }
  
  if (tests) {
    queryString += `&Tests=${tests.replace(/ /g, '%2C')}`;
  }
  
  const requestSegment = `${projectName}/buildWithParameters?token=crmftw${queryString}`;
  const projectUrl = `${JENKINS_BASE_URL}/job/${projectName}`;
  
  try {
    const response = await axios.post(
      `${JENKINS_BASE_URL}/job/${requestSegment}`,
      {},
      {
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json'
        },
        timeout: 5000,
        validateStatus: () => true
      }
    );
    
    if (response.status !== 201) {
      // Retry if job is running
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        const running = await checkForRunningJob(projectName);
        if (running) {
          break;
        }
        const retryResponse = await axios.post(
          `${JENKINS_BASE_URL}/job/${requestSegment}`,
          {},
          {
            headers: {
              'Authorization': getAuthHeader(),
              'Content-Type': 'application/json'
            },
            timeout: 5000,
            validateStatus: () => true
          }
        );
        if (retryResponse.status === 201) {
          break;
        }
      }
    }
    
    shell.openExternal(projectUrl);
    return { success: true, url: projectUrl };
  } catch (error) {
    console.error('Error running job:', error);
    throw error;
  }
}

async function checkForRunningJob(jobName) {
  await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for build to start
  
  try {
    const response = await axios.get(
      `${JENKINS_BASE_URL}/job/${jobName}/api/json`,
      {
        headers: {
          'Authorization': getAuthHeader()
        }
      }
    );
    
    // Check if job is running (color contains "anime")
    if (response.data.color && response.data.color.includes('anime')) {
      return true;
    }
    
    // Check a few more times
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const retryResponse = await axios.get(
        `${JENKINS_BASE_URL}/job/${jobName}/api/json`,
        {
          headers: {
            'Authorization': getAuthHeader()
          }
        }
      );
      if (retryResponse.data.color && retryResponse.data.color.includes('anime')) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking running job:', error);
    return false;
  }
}

async function getJiraIdFromJob(jobName, buildNo) {
  try {
    const response = await axios.get(
      `${JENKINS_BASE_URL}/job/${jobName}/${buildNo}/api/json`,
      {
        headers: {
          'Authorization': getAuthHeader()
        }
      }
    );
    
    const actions = response.data.actions || [];
    for (const action of actions) {
      if (action.parameters) {
        for (const param of action.parameters) {
          if (param.name && param.name.includes('JiraID')) {
            return param.value || '';
          }
        }
      }
    }
    
    return '';
  } catch (error) {
    console.error('Error getting Jira ID:', error);
    return '';
  }
}

async function getScreenshotUrl(testName, projectName, buildNumber) {
  try {
    const response = await axios.get(
      `${JENKINS_BASE_URL}/job/${projectName}/${buildNumber}/api/json`,
      {
        headers: {
          'Authorization': getAuthHeader()
        },
        timeout: 10000
      }
    );
    
    if (!response.data) {
      console.warn('Invalid response from Jenkins');
      return null;
    }
    
    // Handle both array and object formats for artifacts
    let artifacts = [];
    try {
      if (Array.isArray(response.data.artifacts)) {
        artifacts = response.data.artifacts;
      } else if (response.data.artifacts) {
        artifacts = Array.isArray(response.data.artifacts) 
          ? response.data.artifacts 
          : [response.data.artifacts];
      }
    } catch (e) {
      console.warn('Error parsing artifacts:', e);
    }
    
    if (artifacts.length === 0) {
      console.warn('No artifacts found in Jenkins response');
      return null;
    }
    
    // Primary pattern: testName + "_Failure.png" (matches original C# code)
    const primaryPattern = testName + '_Failure.png';
    
    // Try to find the screenshot
    for (const artifact of artifacts) {
      if (!artifact || !artifact.fileName) continue;
      
      // Check for the primary pattern (case-insensitive)
      if (artifact.fileName.includes(primaryPattern) || 
          artifact.fileName.toLowerCase().includes(primaryPattern.toLowerCase())) {
        const relativePath = artifact.relativePath || artifact.fileName;
        if (relativePath) {
          const url = `${JENKINS_BASE_URL}/job/${projectName}/${buildNumber}/artifact/${relativePath}`;
          console.log('Found screenshot:', url);
          return url;
        }
      }
    }
    
    // Fallback: try other patterns
    const fallbackPatterns = [
      testName + '_failure.png',
      testName + '_Failure.PNG',
      testName.replace(/\./g, '_') + '_Failure.png',
      testName.replace(/\./g, '_') + '_failure.png'
    ];
    
    for (const pattern of fallbackPatterns) {
      for (const artifact of artifacts) {
        if (!artifact || !artifact.fileName) continue;
        if (artifact.fileName.includes(pattern) || 
            artifact.fileName.toLowerCase().includes(pattern.toLowerCase())) {
          const relativePath = artifact.relativePath || artifact.fileName;
          if (relativePath) {
            const url = `${JENKINS_BASE_URL}/job/${projectName}/${buildNumber}/artifact/${relativePath}`;
            console.log('Found screenshot (fallback):', url);
            return url;
          }
        }
      }
    }
    
    // Log available PNG files for debugging
    const pngFiles = artifacts
      .filter(a => a && a.fileName && a.fileName.toLowerCase().endsWith('.png'))
      .map(a => a.fileName)
      .slice(0, 10);
    
    console.warn(`Screenshot not found for test: ${testName}`);
    console.warn('Available PNG artifacts:', pngFiles);
    
    return null;
  } catch (error) {
    console.error('Error getting screenshot URL:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - Jenkins server may be slow or unreachable');
    }
    throw error;
  }
}

async function getNightlyReruns(date) {
  try {
    const response = await axios.get(
      `${JENKINS_BASE_URL}/job/Nightly/lastBuild/api/json`,
      {
        headers: {
          'Authorization': getAuthHeader()
        }
      }
    );
    
    // Check if this is the right date
    const timestamp = response.data.timestamp;
    const buildDate = new Date(timestamp);
    const expectedDate = new Date(date);
    expectedDate.setDate(expectedDate.getDate() - 1);
    
    if (buildDate < expectedDate) {
      return { error: 'Nightly was not successful, nothing to rerun' };
    }
    
    const subBuilds = response.data.subBuilds || [];
    const failedJobs = [];
    
    for (const subBuild of subBuilds) {
      if (subBuild.jobName.includes('Maintenance')) {
        continue;
      }
      
      const jobResponse = await axios.get(
        `${subBuild.url}api/json`,
        {
          headers: {
            'Authorization': getAuthHeader()
          }
        }
      );
      
      const jobSubBuilds = jobResponse.data.build?.subBuilds || [];
      const failed = jobSubBuilds.filter(b => 
        b.result && (b.result.toLowerCase().includes('failure') || b.result.toLowerCase().includes('aborted'))
      );
      
      if (failed.length > 0) {
        failedJobs.push({
          jobName: subBuild.jobName,
          failedBuilds: failed.map(b => b.url)
        });
      }
    }
    
    return { failedJobs };
  } catch (error) {
    console.error('Error getting nightly reruns:', error);
    throw error;
  }
}

async function postNightlyStats() {
  const jobUrl = `${JENKINS_BASE_URL}/job/Nightly-SDET-Stats/build?token=crmftw`;
  
  try {
    const response = await axios.post(
      jobUrl,
      {},
      {
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: () => true
      }
    );
    
    // Open Jenkins job page
    const jobPageUrl = `${JENKINS_BASE_URL}/job/Nightly-SDET-Stats/`;
    shell.openExternal(jobPageUrl);
    
    return { success: true, url: jobPageUrl, status: response.status };
  } catch (error) {
    console.error('Error posting nightly stats:', error);
    throw error;
  }
}

module.exports = {
  rerunTests,
  runJob,
  getJobUrl,
  getScreenshotUrl,
  getNightlyReruns,
  getJiraIdFromJob,
  postNightlyStats
};

