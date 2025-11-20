const sql = require('mssql');
require('dotenv').config();

// Get password from environment variable (Windows uses the username as the key)
const getPassword = () => {
  const username = 'care-plat-qe';
  // Try different environment variable formats
  return process.env[username] || 
         process.env.CARE_PLAT_QE_PASSWORD || 
         process.env['care-plat-qe'] ||
         process.env.DB_PASSWORD;
};

const config = {
  server: 'ls.crm.mssql.int.test-godaddy.com',
  database: 'CRM',
  user: 'care-plat-qe',
  password: getPassword(),
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
    encrypt: true,
    connectTimeout: 30000, // 30 seconds connection timeout
    requestTimeout: 60000, // 60 seconds request timeout
    enableImplicitArithAbort: true,
    multiSubnetFailover: true // Important for SQL Server availability groups
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000
  },
  connectionTimeout: 30000,
  requestTimeout: 60000
};

// Validate password is set
if (!config.password) {
  console.error('Database password not found in environment variables!');
  console.error('Please set one of: care-plat-qe, CARE_PLAT_QE_PASSWORD, or DB_PASSWORD in your .env file');
}

let pool = null;
let isConnecting = false;

async function resetConnection() {
  try {
    if (pool && pool.connected) {
      await pool.close();
    }
    pool = null;
    isConnecting = false;
    // Force a new connection
    return await getConnection();
  } catch (error) {
    console.error('Error resetting connection:', error);
    throw error;
  }
}

async function getConnection() {
  // If already connecting, wait for that connection
  if (isConnecting) {
    let attempts = 0;
    while (isConnecting && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    if (pool && pool.connected) {
      return pool;
    }
  }
  
  // If pool exists and is connected, return it
  if (pool && pool.connected) {
    try {
      // Test the connection
      await pool.request().query('SELECT 1');
      return pool;
    } catch (error) {
      console.warn('Pool connection test failed, reconnecting...', error.message);
      pool = null;
    }
  }
  
  // Create new connection
  isConnecting = true;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('Database connection established');
    isConnecting = false;
    return pool;
  } catch (error) {
    isConnecting = false;
    console.error('Database connection error:', error);
    
    // Provide more helpful error messages
    if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
      throw new Error(`Database connection timeout. Please check:\n` +
        `1. Network connectivity to ${config.server}\n` +
        `2. VPN connection (if required)\n` +
        `3. Firewall settings\n` +
        `4. Database server status`);
    } else if (error.code === 'ELOGIN') {
      throw new Error(`Database authentication failed. Please check:\n` +
        `1. Password in .env file is correct\n` +
        `2. User '${config.user}' has proper permissions`);
    } else if (error.code === 'ESOCKET') {
      throw new Error(`Cannot reach database server ${config.server}.\n` +
        `Please check network connectivity and VPN connection.`);
    } else {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }
}

function getDateRange(date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  let endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(23, 59, 59, 999);
  
  // Handle Monday (previous Friday)
  if (new Date().getDay() === 1) {
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }
  
  return {
    start: startDate.toISOString().slice(0, 23),
    end: endDate.toISOString().slice(0, 23)
  };
}

function setDiscountName(code) {
  const discountMap = {
    0: '',
    1: 'External Team',
    2: 'CRM DevOps',
    3: 'Bug Found By Automation',
    4: 'Code Change',
    5: 'Automation Testing',
    6: 'Accident',
    7: 'Jenkins',
    8: 'Holiday',
    9: 'Deploy'
  };
  return discountMap[code] || '';
}

function getDiscountCode(name) {
  const codeMap = {
    'External Team': 1,
    'CRM DevOps': 2,
    'Bug Found By Automation': 3,
    'Code Change': 4,
    'Automation Testing': 5,
    'Accident': 6,
    'Jenkins': 7,
    'Deploy': 9,
    'Holiday': 8,
    'Clear Discount': 0
  };
  return codeMap[name] !== undefined ? codeMap[name] : parseInt(name) || 0;
}

async function getFailedTests(date, browser) {
  try {
    const pool = await getConnection();
    const dateRange = getDateRange(new Date(date));
    
    let query = `
      SELECT id, BuildNumber, AutomationType, Env, ProjectName, TestName, Rerun, 
             ErrorMsg, StackTrace, Discount, DiscountReason, Browser, ProjectOwner, CreateDateUtc
      FROM dbo.AutomationResults 
      WHERE LogType = 'Nightly' 
        AND TestResult IN ('Failed', 'Skipped', 'NotExecuted', 'Timeout')
        AND LogType != 'Weekly'
        AND CreateDateUtc > @startDate 
        AND CreateDateUtc < @endDate
    `;
    
    if (browser && browser !== '--') {
      query += ` AND Browser = @browser`;
    }
    
    query += ` ORDER BY id`;
    
    const request = pool.request();
    request.input('startDate', sql.DateTime, dateRange.start);
    request.input('endDate', sql.DateTime, dateRange.end);
    if (browser && browser !== '--') {
      request.input('browser', sql.NVarChar, browser);
    }
    
    const result = await request.query(query);
    
    return result.recordset.map(row => ({
      id: row.id,
      buildNo: row.BuildNumber,
      type: row.AutomationType,
      env: row.Env,
      project: row.ProjectName,
      testName: row.TestName,
      rerun: row.Rerun,
      error: row.ErrorMsg || '',
      stackTrace: row.StackTrace || '',
      discCode: setDiscountName(row.Discount),
      discReason: row.DiscountReason || '',
      browser: row.Browser || '',
      owner: row.ProjectOwner || '',
      createDateUtc: row.CreateDateUtc
    }));
  } catch (error) {
    console.error('Error in getFailedTests:', error);
    // Reset pool on connection errors
    if (error.code === 'ETIMEOUT' || error.code === 'ESOCKET' || error.message.includes('timeout')) {
      pool = null;
    }
    throw error;
  }
}

async function getYesterdaysDiscounts(date) {
  const pool = await getConnection();
  const dateRange = getDateRange(new Date(date));
  
  const query = `
    SELECT id, AutomationType, Env, ProjectName, TestName, ErrorMsg, Discount, 
           DiscountReason, BuildNumber, CreateDateUtc
    FROM dbo.AutomationResults 
    WHERE TestResult = 'Failed' 
      AND LogType = 'Nightly' 
      AND Discount > 0 
      AND CreateDateUtc > @startDate 
      AND CreateDateUtc < @endDate
  `;
  
  const request = pool.request();
  request.input('startDate', sql.DateTime, dateRange.start);
  request.input('endDate', sql.DateTime, dateRange.end);
  
  const result = await request.query(query);
  
  return result.recordset.map(row => ({
    id: row.id,
    type: row.AutomationType,
    env: row.Env,
    project: row.ProjectName,
    testName: row.TestName,
    error: row.ErrorMsg || '',
    discCode: setDiscountName(row.Discount),
    discReason: row.DiscountReason || '',
    buildNo: row.BuildNumber,
    createDateUtc: row.CreateDateUtc
  }));
}

async function getRecentDiscounts(date, daysBack) {
  const pool = await getConnection();
  
  // If daysBack is 0, use the date as-is (frontend already calculated the correct date)
  // Otherwise, use the old logic for backward compatibility
  let dateRange;
  if (daysBack === 0) {
    // Use the date directly (frontend already handled weekend logic)
    dateRange = getDateRange(new Date(date));
  } else {
    // Old logic for backward compatibility
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - daysBack + 2);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() - daysBack + 3);
    endDate.setHours(23, 59, 59, 999);
    
    dateRange = {
      start: startDate.toISOString().slice(0, 23),
      end: endDate.toISOString().slice(0, 23)
    };
  }
  
  const query = `
    SELECT id, AutomationType, Env, ProjectName, TestName, ErrorMsg, Discount, 
           DiscountReason, BuildNumber, CreateDateUtc
    FROM dbo.AutomationResults 
    WHERE CreateDateUtc > @startDate 
      AND CreateDateUtc < @endDate 
      AND TestResult NOT IN ('Passed') 
      AND Discount > 0
  `;
  
  const request = pool.request();
  request.input('startDate', sql.DateTime, dateRange.start);
  request.input('endDate', sql.DateTime, dateRange.end);
  
  const result = await request.query(query);
  
  return result.recordset.map(row => ({
    id: row.id,
    type: row.AutomationType,
    env: row.Env,
    project: row.ProjectName,
    testName: row.TestName,
    error: row.ErrorMsg || '',
    discCode: setDiscountName(row.Discount),
    discReason: row.DiscountReason || '',
    buildNo: row.BuildNumber,
    createDateUtc: row.CreateDateUtc
  }));
}

async function discountTest(testId, discountCode, discountReason) {
  const pool = await getConnection();
  const code = getDiscountCode(discountCode);
  const reason = code === 0 ? '' : discountReason;
  
  const query = `
    UPDATE [CRM].[dbo].AutomationResults 
    SET Discount = @discCode, 
        DiscountReason = @discReason, 
        ModifyBy = @modifyBy 
    WHERE id = @testId
  `;
  
  const request = pool.request();
  request.input('discCode', sql.Int, code);
  request.input('discReason', sql.NVarChar, reason);
  request.input('modifyBy', sql.NVarChar, process.env.USERNAME || 'unknown');
  request.input('testId', sql.Int, testId);
  
  await request.query(query);
  return { success: true };
}

async function getProjectList(env, automationType) {
  const pool = await getConnection();
  
  let query = `SELECT DISTINCT ProjectName FROM dbo.AutomationResults WHERE Logtype = 'Count'`;
  
  if (automationType && automationType !== '--') {
    query += ` AND AutomationType = @automationType`;
  }
  
  query += ` ORDER BY ProjectName`;
  
  const request = pool.request();
  if (automationType && automationType !== '--') {
    request.input('automationType', sql.NVarChar, automationType.toLowerCase());
  }
  
  const result = await request.query(query);
  return ['--', ...result.recordset.map(row => row.ProjectName)];
}

async function getStats(date, discounted) {
  const pool = await getConnection();
  const dateRange = getDateRange(new Date(date));
  
  let query = `
    SELECT ProjectName, TestName, Env, AutomationType, Discount, DiscountReason, Rerun, ProjectOwner
    FROM dbo.AutomationResults
    WHERE LogType = 'Nightly' 
      AND TestResult IN ('Failed', 'Skipped')
      AND CreateDateUtc > @startDate 
      AND CreateDateUtc < @endDate
  `;
  
  if (discounted) {
    query += ` AND Discount > 0`;
  } else {
    query += ` AND Discount = 0`;
  }
  
  const request = pool.request();
  request.input('startDate', sql.DateTime, dateRange.start);
  request.input('endDate', sql.DateTime, dateRange.end);
  
  const result = await request.query(query);
  
  // Group by project and calculate stats
  const projectStats = {};
  
  result.recordset.forEach(row => {
    const project = row.ProjectName;
    if (!projectStats[project]) {
      projectStats[project] = {
        project,
        testCount: 0,
        prodCount: 0,
        discountReasons: new Set(),
        type: getTypeFromProject(project),
        owner: row.ProjectOwner || 'N/A'
      };
    }
    
    if (row.Env === 'TEST' || row.Env === 'BETA') {
      projectStats[project].testCount++;
    } else if (row.Env === 'PROD' || row.Env === 'LIVE') {
      projectStats[project].prodCount++;
    }
    
    if (row.DiscountReason) {
      projectStats[project].discountReasons.add(row.DiscountReason);
    }
  });
  
  return Object.values(projectStats).map(stat => ({
    ...stat,
    discountReasons: Array.from(stat.discountReasons).join(', ')
  }));
}

function getTypeFromProject(projectName) {
  const name = projectName.toLowerCase();
  if (name.includes('legacy') && !name.includes('tasks')) return 'ui';
  if (name.includes('shopper-drawer')) return 'ui';
  if (name.includes('services')) return 'api';
  if (name.includes('ecomm-events')) return 'api';
  if (name.includes('api-uui-shell')) return 'api';
  if (name.includes('profile-sync')) return 'ui';
  if (name.includes('transcript-viewer')) return 'ui';
  if (name.includes('ui') || name.includes('wtf')) return 'ui';
  if (name.includes('api')) return 'api';
  return 'ui';
}

function getStatsAppName(projectName) {
  // Simplified version - matches the C# logic
  let name = projectName;
  if (name.includes('-ui-') && name !== 'qe-crm-ui-shell') {
    const match = name.match(/-ui-(.+?)(-v2)?$/);
    if (match) name = match[1];
  } else if (name.includes('api')) {
    const match = name.match(/-api-(.+?)$/);
    if (match) name = match[1];
  }
  
  if (name.includes('dotnet')) {
    name = name.replace('-dotnet', '');
  }
  
  // Title case
  return name.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

async function getPercentages(date) {
  const pool = await getConnection();
  const dateRange = getDateRange(new Date(date));
  
  // Get total counts
  const totalQuery = `
    SELECT 
      SUM(CASE WHEN Env IN ('TEST', 'BETA') AND AutomationType = 'ui' THEN 1 ELSE 0 END) as uiTestCount,
      SUM(CASE WHEN Env IN ('TEST', 'BETA') AND AutomationType = 'api' THEN 1 ELSE 0 END) as apiTestCount,
      SUM(CASE WHEN Env IN ('PROD', 'LIVE') AND AutomationType = 'ui' THEN 1 ELSE 0 END) as uiProdCount,
      SUM(CASE WHEN Env IN ('PROD', 'LIVE') AND AutomationType = 'api' THEN 1 ELSE 0 END) as apiProdCount
    FROM dbo.AutomationResults 
    WHERE LogType = 'Nightly' 
      AND CreateDateUtc > @startDate 
      AND CreateDateUtc < @endDate
  `;
  
  const totalRequest = pool.request();
  totalRequest.input('startDate', sql.DateTime, dateRange.start);
  totalRequest.input('endDate', sql.DateTime, dateRange.end);
  const totalResult = await totalRequest.query(totalQuery);
  const totals = totalResult.recordset[0];
  
  // Get failed counts (not discounted)
  const failedQuery = `
    SELECT 
      SUM(CASE WHEN Env = 'TEST' AND AutomationType = 'ui' AND Discount = 0 THEN 1 ELSE 0 END) as testUiFail,
      SUM(CASE WHEN Env = 'TEST' AND AutomationType = 'api' AND Discount = 0 THEN 1 ELSE 0 END) as testApiFail,
      SUM(CASE WHEN Env = 'PROD' AND AutomationType = 'ui' AND Discount = 0 THEN 1 ELSE 0 END) as prodUiFail,
      SUM(CASE WHEN Env = 'PROD' AND AutomationType = 'api' AND Discount = 0 THEN 1 ELSE 0 END) as prodApiFail
    FROM dbo.AutomationResults 
    WHERE LogType = 'Nightly' 
      AND TestResult IN ('Failed', 'Skipped')
      AND CreateDateUtc > @startDate 
      AND CreateDateUtc < @endDate
  `;
  
  const failedRequest = pool.request();
  failedRequest.input('startDate', sql.DateTime, dateRange.start);
  failedRequest.input('endDate', sql.DateTime, dateRange.end);
  const failedResult = await failedRequest.query(failedQuery);
  const failed = failedResult.recordset[0];
  
  const percentages = {
    testUi: totals.uiTestCount > 0 
      ? Math.round(((totals.uiTestCount - (failed.testUiFail || 0)) / totals.uiTestCount) * 100)
      : 100,
    testApi: totals.apiTestCount > 0
      ? Math.round(((totals.apiTestCount - (failed.testApiFail || 0)) / totals.apiTestCount) * 100)
      : 100,
    prodUi: totals.uiProdCount > 0
      ? Math.round(((totals.uiProdCount - (failed.prodUiFail || 0)) / totals.uiProdCount) * 100)
      : 100,
    prodApi: totals.apiProdCount > 0
      ? Math.round(((totals.apiProdCount - (failed.prodApiFail || 0)) / totals.apiProdCount) * 100)
      : 100
  };
  
  return percentages;
}

async function getCountStats(date) {
  const pool = await getConnection();
  const dateRange = getDateRange(new Date(date));
  
  // Get expected counts
  const expectedQuery = `
    SELECT ProjectName, Env, TestRunTime as TestCount
    FROM dbo.AutomationResults 
    WHERE LogType = 'Count' 
    ORDER BY ProjectName, Env
  `;
  
  const expectedResult = await pool.request().query(expectedQuery);
  const expected = expectedResult.recordset;
  
  // Get actual counts
  const actualQuery = `
    SELECT ProjectName, Env, COUNT(TestName) as TestCount
    FROM dbo.AutomationResults 
    WHERE LogType = 'Nightly' 
      AND CreateDateUtc > @startDate 
      AND CreateDateUtc < @endDate
    GROUP BY ProjectName, Env
    ORDER BY ProjectName, Env
  `;
  
  const actualRequest = pool.request();
  actualRequest.input('startDate', sql.DateTime, dateRange.start);
  actualRequest.input('endDate', sql.DateTime, dateRange.end);
  const actualResult = await actualRequest.query(actualQuery);
  const actual = actualResult.recordset;
  
  const under = [];
  const over = [];
  
  expected.forEach(exp => {
    if (exp.TestCount === 0) return;
    
    const act = actual.find(a => 
      a.ProjectName === exp.ProjectName && a.Env === exp.Env
    );
    
    if (!act) {
      under.push(`${exp.Env} ${exp.ProjectName}\nExpected: ${exp.TestCount} Actual: 0\n`);
    } else if (exp.TestCount !== act.TestCount) {
      if (exp.TestCount < act.TestCount) {
        over.push(`${exp.Env} ${exp.ProjectName}\nExpected: ${exp.TestCount} Actual: ${act.TestCount}\n`);
      } else {
        under.push(`${exp.Env} ${exp.ProjectName}\nExpected: ${exp.TestCount} Actual: ${act.TestCount}\n`);
      }
    }
  });
  
  actual.forEach(act => {
    const exp = expected.find(e => 
      e.ProjectName === act.ProjectName && e.Env === act.Env
    );
    if (!exp) {
      over.push(`${act.Env} ${act.ProjectName}\nExpected: NONE Actual: ${act.TestCount}\n`);
    }
  });
  
  return {
    under: under.join(''),
    over: over.join('')
  };
}

async function getTestDetails(testId) {
  const pool = await getConnection();
  
  const query = `
    SELECT TestName, ProjectName, ErrorMsg, StackTrace, Env, MachineName, AppVersion, 
           TestResult, TestRunTime, Rerun, AutomationType, LogType, Browser, Discount, 
           DiscountReason, CreateDateUtc, ModifyDateUtc, BuildNumber
    FROM [CRM].[dbo].[AutomationResults] 
    WHERE id = @testId
  `;
  
  const request = pool.request();
  request.input('testId', sql.Int, testId);
  
  const result = await request.query(query);
  
  if (result.recordset.length === 0) {
    throw new Error('Test not found');
  }
  
  const row = result.recordset[0];
  return {
    testName: row.TestName,
    projectName: row.ProjectName,
    errorMsg: row.ErrorMsg || '',
    stackTrace: row.StackTrace || '',
    env: row.Env,
    machineName: row.MachineName || '',
    appVersion: row.AppVersion || '',
    result: row.TestResult,
    runTime: row.TestRunTime,
    rerun: row.Rerun,
    type: row.AutomationType,
    logType: row.LogType,
    browser: row.Browser || '',
    discount: setDiscountName(row.Discount),
    discReason: row.DiscountReason || '',
    createDateUtc: row.CreateDateUtc,
    modifyDateUtc: row.ModifyDateUtc,
    buildNumber: row.BuildNumber
  };
}

module.exports = {
  getFailedTests,
  getYesterdaysDiscounts,
  getRecentDiscounts,
  discountTest,
  getProjectList,
  getStats,
  getPercentages,
  getCountStats,
  getTestDetails,
  getStatsAppName,
  resetConnection
};

