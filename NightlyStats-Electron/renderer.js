// Global state
let allFailedTests = [];
let filteredFailedTests = [];
let yesterdaysDiscounts = [];
let currentDate = new Date();

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme from localStorage
    initializeTheme();
    
    // Set default date (yesterday, or Friday if Monday)
    const today = new Date();
    if (today.getDay() === 1) {
        currentDate = new Date(today);
        currentDate.setDate(currentDate.getDate() - 3);
    } else {
        currentDate = new Date(today);
        currentDate.setDate(currentDate.getDate() - 1);
    }
    
    document.getElementById('runDate').valueAsDate = currentDate;
    
    // Set icon in header and favicon
    try {
        const iconPath = await window.electronAPI.getIconPath();
        if (iconPath) {
            // Update favicon
            const favicon = document.querySelector('link[rel="icon"]');
            if (favicon) {
                favicon.href = iconPath;
            }
            
            // Update header icon
            const headerIcon = document.querySelector('.header-icon');
            if (headerIcon) {
                headerIcon.src = iconPath;
                headerIcon.style.display = '';
            }
        }
    } catch (error) {
        console.error('Error loading icon:', error);
    }
    
    // Load initial data
    await loadFailedTests();
    await loadProjectList();
    
    // Setup event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Settings modal
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('themeSelect').addEventListener('change', handleThemeChange);
    
    // Table sorting
    setupTableSorting('failedTestsTable');
    setupTableSorting('yesterdaysDiscountsTable');
    
    // Filter controls
    document.getElementById('runDate').addEventListener('change', handleDateChange);
    document.getElementById('envFilter').addEventListener('change', applyFilters);
    document.getElementById('projectFilter').addEventListener('change', applyFilters);
    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('browserFilter').addEventListener('change', applyFilters);
    document.getElementById('ownerFilter').addEventListener('change', applyFilters);
    document.getElementById('discountedFilter').addEventListener('change', applyFilters);
    
    // Action buttons
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    document.getElementById('refreshTable').addEventListener('click', loadFailedTests);
    document.getElementById('openScreenshot').addEventListener('click', openScreenshot);
    document.getElementById('openTestDetails').addEventListener('click', openTestDetails);
    document.getElementById('launchJob').addEventListener('click', launchJob);
    document.getElementById('rerunTest').addEventListener('click', rerunTest);
    
    // Discounting
    document.getElementById('discountSelected').addEventListener('click', discountSelectedTests);
    document.getElementById('getYesterdays').addEventListener('click', getYesterdaysDiscounts);
    document.getElementById('copyDiscounts').addEventListener('click', copyDiscounts);
    document.getElementById('getRecentDiscount').addEventListener('click', getRecentDiscounts);
    
    // Stats
    document.getElementById('generateStats').addEventListener('click', generateStats);
    document.getElementById('copyStats').addEventListener('click', copyStats);
    document.getElementById('generateCountStats').addEventListener('click', generateCountStats);
    document.getElementById('copyCountStats').addEventListener('click', copyCountStats);
    document.getElementById('postNightlyStats').addEventListener('click', postNightlyStats);
    
    // Run job
    document.getElementById('runTests').addEventListener('click', runTests);
    
    // Checklist
    document.getElementById('showChecklist').addEventListener('change', (e) => {
        const checklist = document.getElementById('checklist');
        const reminders = document.getElementById('reminders');
        if (e.target.checked) {
            checklist.style.display = 'block';
            reminders.style.display = 'none';
        } else {
            checklist.style.display = 'none';
            reminders.style.display = 'block';
        }
    });
    
    // Project Manager link
    document.getElementById('projectManagerLink').addEventListener('click', (e) => {
        e.preventDefault();
        const exePath = 'C:\\code\\qe-Tools-v2\\ProjectManagerTool\\bin\\Release\\ProjectManagerTool.exe';
        window.electronAPI.launchExecutable(exePath);
    });
    
    // Reminder buttons
    document.getElementById('ivrTest').addEventListener('click', () => {
        runIvrMaintenanceJob('TEST');
    });
    
    document.getElementById('ivrProd').addEventListener('click', () => {
        runIvrMaintenanceJob('PROD');
    });
    
    document.getElementById('phoneDoc').addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternal('https://godaddy-corp.atlassian.net/wiki/x/kcJMuw');
    });
    
    document.getElementById('cyberArk').addEventListener('click', () => {
        window.electronAPI.openExternal('https://godaddy.okta.com/home/cyberarkpvwa/0oazbrazjsGGn5O3p0x7/aln19bdjwh3WDE65P1d8');
    });
    
    // Initialize reminders visibility
    const showChecklist = document.getElementById('showChecklist');
    const checklist = document.getElementById('checklist');
    const reminders = document.getElementById('reminders');
    if (showChecklist && checklist && reminders) {
        reminders.style.display = showChecklist.checked ? 'none' : 'block';
    }
    
    // Table selection
    document.getElementById('selectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#failedTestsBody .test-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const row = cb.closest('tr');
            if (row) {
                if (e.target.checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        });
    });
    
    document.getElementById('selectAllDiscounts').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#yesterdaysDiscountsBody .discount-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const row = cb.closest('tr');
            if (row) {
                if (e.target.checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        });
    });
    
    // Modal close
    document.querySelector('#testDetailsModal .close').addEventListener('click', () => {
        document.getElementById('testDetailsModal').style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        const testDetailsModal = document.getElementById('testDetailsModal');
        const settingsModal = document.getElementById('settingsModal');
        
        if (e.target === testDetailsModal) {
            testDetailsModal.style.display = 'none';
        }
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
}

async function loadFailedTests() {
    showLoading();
    try {
        const date = document.getElementById('runDate').valueAsDate;
        const browser = document.getElementById('browserFilter').value;
        
        // Convert selected date to UTC date (add 1 day)
        const targetDate = getUtcDateForSelectedDate(date);
        
        allFailedTests = await window.electronAPI.getFailedTests(
            targetDate.toISOString(),
            browser === '--' ? null : browser
        );
        
        applyFilters();
    } catch (error) {
        showError('Error loading failed tests: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function loadProjectList() {
    try {
        const env = document.getElementById('envFilter').value;
        const type = document.getElementById('typeFilter').value;
        
        const projects = await window.electronAPI.getProjectList(
            env === '--' ? null : env,
            type === '--' ? null : type
        );
        
        const projectFilter = document.getElementById('projectFilter');
        const projectToRun = document.getElementById('projectToRun');
        
        projectFilter.innerHTML = projects.map(p => `<option value="${p}">${p}</option>`).join('');
        projectToRun.innerHTML = projects.map(p => `<option value="${p}">${p}</option>`).join('');
    } catch (error) {
        console.error('Error loading project list:', error);
    }
}

function applyFilters() {
    const env = document.getElementById('envFilter').value;
    const project = document.getElementById('projectFilter').value;
    const type = document.getElementById('typeFilter').value;
    const browser = document.getElementById('browserFilter').value;
    const owner = document.getElementById('ownerFilter').value;
    const discountedFilter = document.getElementById('discountedFilter').value;
    
    // Get the selected date and determine target UTC date
    // When user selects 11/19 locally, we want records with UTC date of 11/20
    const selectedDate = document.getElementById('runDate').valueAsDate;
    let targetUtcDate = null;
    if (selectedDate) {
        // valueAsDate returns a Date at UTC midnight for the selected date
        // We want to add 1 day to get the target UTC date (11/19 -> 11/20)
        const targetDate = new Date(selectedDate);
        targetDate.setUTCDate(targetDate.getUTCDate() + 1);
        
        targetUtcDate = {
            year: targetDate.getUTCFullYear(),
            month: targetDate.getUTCMonth(),
            day: targetDate.getUTCDate()
        };
    }
    
    filteredFailedTests = allFailedTests.filter(test => {
        // Filter by selected date (compare UTC dates)
        if (targetUtcDate && test.createDateUtc) {
            const testDateUtc = new Date(test.createDateUtc);
            const testYear = testDateUtc.getUTCFullYear();
            const testMonth = testDateUtc.getUTCMonth();
            const testDay = testDateUtc.getUTCDate();
            
            // Compare UTC dates (year, month, day only)
            if (testYear !== targetUtcDate.year || 
                testMonth !== targetUtcDate.month || 
                testDay !== targetUtcDate.day) {
                return false;
            }
        }
        
        if (env !== '--' && test.env !== env) return false;
        if (project !== '--' && test.project !== project) return false;
        if (type !== '--' && test.type.toUpperCase() !== type.toUpperCase()) return false;
        if (browser !== '--' && test.browser !== browser) return false;
        if (owner !== '--' && test.owner !== owner) return false;
        
        // Handle discounted filter
        if (discountedFilter === 'discounted' && (!test.discCode || test.discCode === '')) return false;
        if (discountedFilter === 'not-discounted' && test.discCode && test.discCode !== '') return false;
        // 'all' - no filtering needed
        
        return true;
    });
    
    renderFailedTestsTable();
    updateTestCounts();
}

function updateTestCounts() {
    // Update Tests Displayed
    document.getElementById('totalTests').textContent = filteredFailedTests.length;
    
    // Update Total Failed
    document.getElementById('totalFailed').textContent = filteredFailedTests.length;
    
    // Update Total N/A Failed (tests where owner is N/A)
    const naFailedCount = filteredFailedTests.filter(test => test.owner === 'N/A').length;
    document.getElementById('totalNAFailed').textContent = naFailedCount;
}

function renderFailedTestsTable() {
    const tbody = document.getElementById('failedTestsBody');
    tbody.innerHTML = '';
    
    filteredFailedTests.forEach(test => {
        const row = document.createElement('tr');
        row.setAttribute('data-test-id', test.id);
        // Store the full test object as JSON for reliable retrieval
        row.setAttribute('data-test-data', JSON.stringify(test));
        row.className = 'test-row';
        
        // Create checkbox first
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-test-id', test.id);
        checkbox.className = 'test-checkbox';
        
        // Add change handler to checkbox
        checkbox.addEventListener('change', function(e) {
            console.log('Checkbox changed:', this.checked, 'for test id:', test.id);
            if (this.checked) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
            updateSelectAllCheckbox();
        });
        
        // Add click handler directly to checkbox to ensure it works
        checkbox.addEventListener('click', function(e) {
            // Let the default behavior happen (check/uncheck)
            console.log('Checkbox clicked, will be:', !this.checked);
            // The change event will fire automatically
        });
        
        // Make row clickable to toggle checkbox
        row.addEventListener('click', function(e) {
            // Don't toggle if clicking on the checkbox itself (it handles its own click)
            if (e.target === checkbox || e.target.type === 'checkbox') {
                return; // Let checkbox handle its own click
            }
            // Toggle checkbox when clicking row
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // Create cells
        const checkboxCell = document.createElement('td');
        checkboxCell.appendChild(checkbox);
        row.appendChild(checkboxCell);
        
        // Create remaining cells
        const cells = [
            test.id,
            test.buildNo,
            test.type,
            test.env,
            test.project,
            escapeHtml(test.testName),
            null, // Rerun column - will be handled separately
            truncateText(escapeHtml(test.error), 100),
            test.discCode,
            escapeHtml(test.discReason),
            test.browser,
            test.owner,
            formatDate(test.createDateUtc)
        ];
        
        cells.forEach((cellContent, index) => {
            const cell = document.createElement('td');
            
            // Handle Rerun column (index 6) as checkbox
            if (index === 6) {
                const rerunCheckbox = document.createElement('input');
                rerunCheckbox.type = 'checkbox';
                rerunCheckbox.checked = test.rerun || false;
                rerunCheckbox.disabled = true; // Make it read-only/display only
                rerunCheckbox.style.cursor = 'default';
                cell.appendChild(rerunCheckbox);
                cell.style.textAlign = 'center';
            } else if (index === 7) { // Error column
                cell.title = escapeHtml(test.error);
                cell.textContent = cellContent;
            } else {
                // Use textContent for safety (HTML is already escaped)
                cell.textContent = cellContent;
            }
            
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
    });
    
    // Update select all checkbox state
    updateSelectAllCheckbox();
}

function updateSelectAllCheckbox() {
    const allCheckboxes = document.querySelectorAll('#failedTestsBody .test-checkbox');
    const checkedCheckboxes = document.querySelectorAll('#failedTestsBody .test-checkbox:checked');
    const selectAllCheckbox = document.getElementById('selectAll');
    
    if (selectAllCheckbox) {
        if (allCheckboxes.length === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (checkedCheckboxes.length === allCheckboxes.length) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else if (checkedCheckboxes.length > 0) {
            selectAllCheckbox.indeterminate = true;
            selectAllCheckbox.checked = false;
        } else {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        }
    }
}

function renderYesterdaysDiscountsTable(discounts) {
    const tbody = document.getElementById('yesterdaysDiscountsBody');
    tbody.innerHTML = '';
    
    discounts.forEach(discount => {
        const row = document.createElement('tr');
        row.setAttribute('data-discount-id', discount.id);
        row.className = 'discount-row';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-discount-id', discount.id);
        checkbox.className = 'discount-checkbox';
        
        // Add click handler to checkbox
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
        
        // Make row clickable to toggle checkbox
        row.addEventListener('click', function(e) {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        
        row.innerHTML = `
            <td></td>
            <td>${discount.id}</td>
            <td>${discount.type}</td>
            <td>${discount.env}</td>
            <td>${discount.project}</td>
            <td>${escapeHtml(discount.testName)}</td>
            <td title="${escapeHtml(discount.error)}">${truncateText(escapeHtml(discount.error), 100)}</td>
            <td>${discount.discCode}</td>
            <td>${escapeHtml(discount.discReason)}</td>
            <td>${discount.buildNo}</td>
            <td>${formatDate(discount.createDateUtc)}</td>
        `;
        
        // Insert checkbox into first cell
        row.firstElementChild.appendChild(checkbox);
        tbody.appendChild(row);
    });
}

function resetFilters() {
    document.getElementById('envFilter').value = '--';
    document.getElementById('projectFilter').value = '--';
    document.getElementById('typeFilter').value = '--';
    document.getElementById('browserFilter').value = '--';
    document.getElementById('ownerFilter').value = '--';
    document.getElementById('discountedFilter').value = 'all';
    
    const today = new Date();
    if (today.getDay() === 1) {
        currentDate = new Date(today);
        currentDate.setDate(currentDate.getDate() - 3);
    } else {
        currentDate = new Date(today);
        currentDate.setDate(currentDate.getDate() - 1);
    }
    document.getElementById('runDate').valueAsDate = currentDate;
    
    loadFailedTests();
}

async function handleDateChange() {
    currentDate = document.getElementById('runDate').valueAsDate;
    await loadFailedTests();
}

function getSelectedTests() {
    const checkboxes = document.querySelectorAll('#failedTestsBody .test-checkbox:checked');
    console.log('Found checked checkboxes:', checkboxes.length);
    
    if (checkboxes.length === 0) {
        console.warn('No checkboxes checked');
        return [];
    }
    
    const selected = Array.from(checkboxes).map(cb => {
        // Get the row containing this checkbox
        const row = cb.closest('tr');
        if (!row) {
            console.warn('Checkbox not in a table row');
            return null;
        }
        
        // First try to get test data directly from row data attribute
        const testDataAttr = row.getAttribute('data-test-data');
        if (testDataAttr) {
            try {
                const test = JSON.parse(testDataAttr);
                console.log('Retrieved test from row data:', test.id, test.testName);
                return test;
            } catch (e) {
                console.warn('Failed to parse test data from row:', e);
            }
        }
        
        // Fallback: try to find test by ID in filteredFailedTests
        const testIdAttr = cb.getAttribute('data-test-id') || row.getAttribute('data-test-id');
        if (!testIdAttr) {
            console.warn('No test ID found');
            return null;
        }
        
        // Try both number and string comparison to handle type mismatches
        const testIdNum = parseInt(testIdAttr, 10);
        const testIdStr = testIdAttr.toString();
        
        console.log('Looking for test with id:', testIdNum, '(string:', testIdStr + ')', 'in', filteredFailedTests.length, 'tests');
        
        // Try to find test with loose equality first, then strict
        let test = filteredFailedTests.find(t => {
            if (!t || t.id === undefined || t.id === null) return false;
            // Try both number and string comparison
            return t.id == testIdNum || t.id == testIdStr || 
                   String(t.id) === String(testIdNum) || 
                   Number(t.id) === Number(testIdNum);
        });
        
        if (!test) {
            // Debug: log available test IDs
            const availableIds = filteredFailedTests.slice(0, 5).map(t => ({ id: t.id, type: typeof t.id }));
            console.warn('Test not found for id:', testIdNum, 'Available IDs (first 5):', availableIds);
        }
        
        return test;
    }).filter(t => t !== undefined && t !== null);
    
    console.log('Selected tests:', selected.length, selected.map(t => ({ id: t.id, name: t.testName })));
    
    if (selected.length === 0) {
        console.warn('No tests selected. Checkboxes found:', document.querySelectorAll('#failedTestsBody .test-checkbox').length);
        console.warn('Checked checkboxes:', document.querySelectorAll('#failedTestsBody .test-checkbox:checked').length);
        console.warn('filteredFailedTests length:', filteredFailedTests.length);
    }
    
    return selected;
}

function getSelectedDiscounts() {
    const checkboxes = document.querySelectorAll('#yesterdaysDiscountsBody .discount-checkbox:checked');
    return Array.from(checkboxes).map(cb => {
        const discountId = parseInt(cb.getAttribute('data-discount-id'));
        return yesterdaysDiscounts.find(d => d.id === discountId);
    }).filter(d => d);
}

async function openScreenshot() {
    const selected = getSelectedTests();
    if (selected.length === 0) {
        alert('No tests selected');
        return;
    }
    
    // Filter to only UI tests
    const uiTests = selected.filter(test => test.type === 'ui');
    if (uiTests.length === 0) {
        alert('No UI tests selected. Screenshots are only available for UI tests.');
        return;
    }
    
    if (uiTests.length < selected.length) {
        const nonUiCount = selected.length - uiTests.length;
        console.log(`Skipping ${nonUiCount} non-UI test(s)`);
    }
    
    showLoading();
    
    // Open screenshots for all selected UI tests
    for (const test of uiTests) {
        try {
            console.log('Getting screenshot for:', {
                testName: test.testName,
                project: test.project,
                buildNo: test.buildNo
            });
            
            const url = await window.electronAPI.getScreenshotUrl(
                test.testName,
                test.project,
                test.buildNo
            );
            
            if (url && url.trim() !== '') {
                console.log('Opening screenshot URL in new window:', url);
                const windowTitle = `Screenshot - ${test.testName}`;
                window.electronAPI.openUrlInWindow(url, windowTitle);
            } else {
                console.warn('Screenshot URL not found');
                const jenkinsUrl = `https://echoqa.jenkins.int.godaddy.com/job/${test.project}/${test.buildNo}/`;
                const message = `Screenshot not found for test: ${test.testName}\n\n` +
                              `Would you like to open the Jenkins job page to view artifacts?\n` +
                              `URL: ${jenkinsUrl}`;
                
                if (confirm(message)) {
                    window.electronAPI.openUrlInWindow(jenkinsUrl, `Jenkins Job - ${test.project}`);
                }
            }
        } catch (error) {
            console.error('Error opening screenshot:', error);
            const errorMessage = error.message || error.toString() || 'Unknown error';
            showError(`Error opening screenshot for ${test.testName}: ${errorMessage}`);
            
            // Fallback: offer to open Jenkins job page
            const jenkinsUrl = `https://echoqa.jenkins.int.godaddy.com/job/${test.project}/${test.buildNo}/`;
            setTimeout(() => {
                if (confirm(`Failed to get screenshot URL for ${test.testName}. Would you like to open the Jenkins job page instead?`)) {
                    window.electronAPI.openUrlInWindow(jenkinsUrl, `Jenkins Job - ${test.project}`);
                }
            }, 100);
        }
    }
    
    hideLoading();
    if (uiTests.length > 1) {
        showSuccess(`Opened ${uiTests.length} screenshot(s)`);
    }
}

async function openTestDetails() {
    const selected = getSelectedTests();
    if (selected.length === 0) {
        alert('No tests selected');
        return;
    }
    
    showLoading();
    
    // Open test details for all selected tests in separate windows
    const detailsPromises = selected.map(test => 
        window.electronAPI.getTestDetails(test.id).catch(error => ({
            error: error.message,
            test: test
        }))
    );
    
    const results = await Promise.all(detailsPromises);
    
    // Open each test details in a separate window
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const test = selected[i];
        
        if (result.error) {
            showError(`Error loading test details for ${test.testName}: ${result.error}`);
            continue;
        }
        
        // Open each test details in a separate Electron window
        window.electronAPI.openTestDetailsWindow(result, test);
        
        // Small delay between opening windows to avoid overwhelming the system
        if (i < results.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    hideLoading();
    if (results.length > 1) {
        showSuccess(`Opened ${results.length} test detail window(s)`);
    }
}

function showTestDetailsModal(details, test, currentIndex, totalCount) {
    const modal = document.getElementById('testDetailsModal');
    const content = document.getElementById('testDetailsContent');
    
    const testCounter = (currentIndex && totalCount && totalCount > 1) 
        ? `<div style="margin-bottom: 10px; font-weight: bold; color: #3498db;">Test ${currentIndex} of ${totalCount}</div>` 
        : '';
    
    content.innerHTML = `
        ${testCounter}
        <div class="detail-row">
            <div class="detail-label">Test Name:</div>
            <div class="detail-value">${escapeHtml(details.testName)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Project Name:</div>
            <div class="detail-value">${escapeHtml(details.projectName)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Environment:</div>
            <div class="detail-value">${details.env}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Result:</div>
            <div class="detail-value">${details.result}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Build Number:</div>
            <div class="detail-value">${details.buildNumber}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Error Message:</div>
            <textarea readonly>${escapeHtml(details.errorMsg)}</textarea>
        </div>
        <div class="detail-row">
            <div class="detail-label">Stack Trace:</div>
            <textarea readonly>${escapeHtml(details.stackTrace)}</textarea>
        </div>
        <div class="detail-row">
            <div class="detail-label">Browser:</div>
            <div class="detail-value">${details.browser || 'N/A'}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Discount:</div>
            <div class="detail-value">${details.discount || 'None'}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Discount Reason:</div>
            <div class="detail-value">${escapeHtml(details.discReason || '')}</div>
        </div>
        <div class="action-buttons" style="margin-top: 20px;">
            <button class="btn btn-primary" onclick="window.electronAPI.openExternal('https://echoqa.jenkins.int.godaddy.com/job/${details.projectName}/${details.buildNumber}/')">Open Jenkins Job</button>
            <button class="btn btn-primary" onclick="rerunSingleTest(${test.id})">Rerun Test</button>
        </div>
    `;
    
    modal.style.display = 'block';
}

async function launchJob() {
    const selected = getSelectedTests();
    if (selected.length === 0) {
        alert('No tests selected');
        return;
    }
    
    selected.forEach(test => {
        const url = `https://echoqa.jenkins.int.godaddy.com/job/${test.project}/${test.buildNo}/`;
        window.electronAPI.openExternal(url);
    });
}

async function rerunTest() {
    const selected = getSelectedTests();
    if (selected.length === 0) {
        alert('No tests selected');
        return;
    }
    
    // Verify all tests are from same project/env/build
    const firstTest = selected[0];
    const project = firstTest.project;
    const env = firstTest.env;
    const build = firstTest.buildNo;
    const type = firstTest.type;
    const browser = firstTest.browser;
    
    const allSame = selected.every(test => 
        test.project === project && 
        test.env === env && 
        test.buildNo === build
    );
    
    if (!allSame) {
        alert('All selected tests must be from the same project, environment, and build');
        return;
    }
    
    // Build the retry URL using the same logic as jenkinsService.rerunTests
    const JENKINS_BASE_URL = 'https://echoqa.jenkins.int.godaddy.com';
    
    // Get Jira ID from original job (optional, don't wait if it fails)
    let jiraId = '';
    try {
        // We'll build URL without Jira ID for now, or we could make it optional
        // jiraId = await window.electronAPI.getJiraIdFromJob(project, build);
    } catch (error) {
        console.warn('Could not get Jira ID:', error);
    }
    
    // Build test list
    const testList = selected.map(t => t.testName);
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
    
    // Build retry URL (matching jenkinsService.rerunTests logic exactly)
    let retryUrl = `${JENKINS_BASE_URL}/job/${project}/buildWithParameters?token=crmftw&crmUser=&JobType=Nightly&Retry=true&ENV=${env}&PreviousBuildNo=${build}${browserQueryString}${testQueryString}`;
    
    if (jiraId) {
        retryUrl += `&JiraID=${jiraId}`;
    }
    
    const projectUrl = `${JENKINS_BASE_URL}/job/${project}/`;
    
    // Open the retry URL in a window, check content after 2 seconds
    // If blank, close and open Chrome; if it has content, keep it open
    window.electronAPI.openJobUrlAndChrome(retryUrl, projectUrl);
    showSuccess('Rerun URL opened. Checking page content...');
}

async function rerunSingleTest(testId) {
    const test = allFailedTests.find(t => t.id === testId);
    if (!test) return;
    
    showLoading();
    try {
        await window.electronAPI.rerunTests([test]);
        showSuccess('Test rerun triggered');
    } catch (error) {
        showError('Error rerunning test: ' + error.message);
    } finally {
        hideLoading();
    }
}


async function discountSelectedTests() {
    const selected = getSelectedTests();
    if (selected.length === 0) {
        alert('No tests selected');
        return;
    }
    
    const discountCode = document.getElementById('discountCode').value;
    const discountReason = document.getElementById('discountReason').value;
    
    if (!discountCode) {
        alert('The Discount Code is not selected');
        return;
    }
    
    if (!discountReason && discountCode !== 'Clear Discount') {
        alert('The Discount Reason is not set');
        return;
    }
    
    showLoading();
    try {
        for (const test of selected) {
            await window.electronAPI.discountTest(test.id, discountCode, discountReason);
        }
        
        // Show appropriate success message based on discount code
        const successMessage = discountCode === 'Clear Discount' ? 'Discount cleared' : 'Test(s) discounted';
        showSuccess(successMessage);
        
        document.getElementById('discountCode').value = '';
        document.getElementById('discountReason').value = '';
        await loadFailedTests();
    } catch (error) {
        showError('Error discounting tests: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function getYesterdaysDiscounts() {
    showLoading();
    try {
        const date = document.getElementById('runDate').valueAsDate;
        const targetDate = getUtcDateForSelectedDate(date);
        yesterdaysDiscounts = await window.electronAPI.getYesterdaysDiscounts(targetDate.toISOString());
        renderYesterdaysDiscountsTable(yesterdaysDiscounts);
    } catch (error) {
        showError('Error loading yesterday\'s discounts: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function getRecentDiscounts() {
    showLoading();
    try {
        const date = document.getElementById('runDate').valueAsDate;
        const daysBack = parseInt(document.getElementById('daysBack').value) || 4;
        const baseUtcDate = getUtcDateForSelectedDate(date);
        
        // Calculate the target date, handling weekends (go back to Friday if weekend)
        const targetDate = getDateForRecentDiscounts(baseUtcDate, daysBack);
        
        yesterdaysDiscounts = await window.electronAPI.getRecentDiscounts(targetDate.toISOString(), 0);
        renderYesterdaysDiscountsTable(yesterdaysDiscounts);
    } catch (error) {
        showError('Error loading recent discounts: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function copyDiscounts() {
    const selected = getSelectedDiscounts();
    if (selected.length === 0) {
        alert('No tests selected');
        return;
    }
    
    showLoading();
    try {
        const date = document.getElementById('runDate').valueAsDate;
        
        for (const discount of selected) {
            // Find matching test in current date
            const matchingTests = allFailedTests.filter(t => 
                t.testName === discount.testName &&
                t.env === discount.env &&
                t.project === discount.project &&
                t.buildNo > discount.buildNo
            );
            
            if (matchingTests.length > 0) {
                const test = matchingTests[0];
                // Check if error messages match (simplified)
                if (test.error.includes(discount.error.substring(0, 185)) || 
                    confirm(`The test being discounted does not have the same ErrorMsg as the test being copied from.\nTest: ${test.testName}\nContinue?`)) {
                    await window.electronAPI.discountTest(test.id, discount.discCode, discount.discReason);
                }
            }
        }
        
        showSuccess('Test(s) discounted');
        await loadFailedTests();
    } catch (error) {
        showError('Error copying discounts: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function generateStats() {
    showLoading();
    try {
        const date = document.getElementById('runDate').valueAsDate;
        const targetDate = getUtcDateForSelectedDate(date);
        const percentages = await window.electronAPI.getPercentages(targetDate.toISOString());
        const stats = await window.electronAPI.getStats(targetDate.toISOString(), false);
        const discountedStats = await window.electronAPI.getStats(targetDate.toISOString(), true);
        
        // Format percentages
        const percArray = [
            { label: 'TEST UI', value: percentages.testUi },
            { label: 'TEST API', value: percentages.testApi },
            { label: 'PROD UI', value: percentages.prodUi },
            { label: 'PROD API', value: percentages.prodApi }
        ];
        
        const sortedPerc = [...new Set(percArray.map(p => p.value))].sort((a, b) => a - b);
        let percOutput = '';
        sortedPerc.forEach(perc => {
            const labels = percArray.filter(p => p.value === perc).map(p => p.label).join(' ');
            percOutput += `${labels} ${perc}% `;
        });
        
        let output = `*${percOutput.trim()}*\n\n`;
        
        // Format stats - need to get owner info
        const uiStats = [];
        const apiStats = [];
        
        for (const stat of stats) {
            const appName = getStatsAppName(stat.project);
            const owner = stat.owner && stat.owner !== 'N/A' ? stat.owner.substring(0, 1) : 'N/A';
            let line = '';
            
            if (stat.prodCount > 0 && stat.testCount > 0) {
                line = `(PROD/TEST) [${appName}](https://echoqa.jenkins.int.godaddy.com/job/${stat.project}) (${stat.prodCount}/${stat.testCount}) (${owner})`;
            } else if (stat.prodCount > 0) {
                line = `(PROD) [${appName}](https://echoqa.jenkins.int.godaddy.com/job/${stat.project}) (${stat.prodCount}) (${owner})`;
            } else if (stat.testCount > 0) {
                line = `(TEST) [${appName}](https://echoqa.jenkins.int.godaddy.com/job/${stat.project}) (${stat.testCount}) (${owner})`;
            }
            
            if (stat.discountReasons) {
                line += ` - ${stat.discountReasons}`;
            }
            
            if (stat.type === 'ui') {
                uiStats.push(line);
            } else {
                apiStats.push(line);
            }
        }
        
        uiStats.sort();
        apiStats.sort();
        
        if (uiStats.length > 0) {
            output += '*UI*\n' + uiStats.join('\n') + '\n';
        }
        
        if (apiStats.length > 0) {
            output += '*API*\n' + apiStats.join('\n') + '\n';
        }
        
        // Format discounted stats
        if (discountedStats.length > 0) {
            output += '\n*Discounted:*\n';
            const discUiStats = [];
            const discApiStats = [];
            
            for (const stat of discountedStats) {
                const appName = getStatsAppName(stat.project);
                const owner = stat.owner && stat.owner !== 'N/A' ? stat.owner.substring(0, 1) : 'N/A';
                let line = '';
                
                if (stat.prodCount > 0 && stat.testCount > 0) {
                    line = `(PROD/TEST) [${appName}](https://echoqa.jenkins.int.godaddy.com/job/${stat.project}) (${stat.prodCount}/${stat.testCount}) (${owner})`;
                } else if (stat.prodCount > 0) {
                    line = `(PROD) [${appName}](https://echoqa.jenkins.int.godaddy.com/job/${stat.project}) (${stat.prodCount}) (${owner})`;
                } else if (stat.testCount > 0) {
                    line = `(TEST) [${appName}](https://echoqa.jenkins.int.godaddy.com/job/${stat.project}) (${stat.testCount}) (${owner})`;
                }
                
                if (stat.discountReasons) {
                    line += ` - ${stat.discountReasons}`;
                }
                
                if (stat.type === 'ui') {
                    discUiStats.push(line);
                } else {
                    discApiStats.push(line);
                }
            }
            
            discUiStats.sort();
            discApiStats.sort();
            
            if (discUiStats.length > 0) {
                output += '*UI*\n' + discUiStats.join('\n') + '\n';
            }
            
            if (discApiStats.length > 0) {
                output += '*API*\n' + discApiStats.join('\n') + '\n';
            }
        }
        
        document.getElementById('nightlyStats').value = output;
    } catch (error) {
        showError('Error generating stats: ' + error.message);
    } finally {
        hideLoading();
    }
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
    
    return name.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

function copyStats() {
    const stats = document.getElementById('nightlyStats').value;
    navigator.clipboard.writeText(stats).then(() => {
        document.getElementById('nightlyStats').value += '\n\n!!COPIED!!';
        showSuccess('Stats copied to clipboard');
    });
}

async function generateCountStats() {
    showLoading();
    try {
        const date = document.getElementById('runDate').valueAsDate;
        const targetDate = getUtcDateForSelectedDate(date);
        const stats = await window.electronAPI.getCountStats(targetDate.toISOString());
        
        let output = '';
        if (stats.under) {
            output += 'CURRENT UNDER COUNTS\n' + stats.under + '\n';
        }
        if (stats.over) {
            output += 'CURRENT OVER COUNTS\n' + stats.over + '\n';
        }
        if (!stats.under && !stats.over) {
            output = 'All counts are accurate';
        }
        
        document.getElementById('countStats').value = output;
    } catch (error) {
        showError('Error generating count stats: ' + error.message);
    } finally {
        hideLoading();
    }
}

function copyCountStats() {
    const stats = document.getElementById('countStats').value;
    navigator.clipboard.writeText(stats).then(() => {
        document.getElementById('countStats').value += '\n\n!!COPIED!!';
        showSuccess('Count stats copied to clipboard');
    });
}

async function runTests() {
    const project = document.getElementById('projectToRun').value;
    const branch = document.getElementById('branch').value;
    const env = document.getElementById('envToRun').value;
    const jiraId = document.getElementById('jiraId').value;
    const browser = document.getElementById('browserToRun').value;
    const tests = document.getElementById('testsToRun').value;
    
    if (project === '--') {
        alert('Select a project to run');
        return;
    }
    
    if (!branch) {
        alert('Select a branch to run');
        return;
    }
    
    if (!env) {
        alert('Select an environment to run');
        return;
    }
    
    // Build the URL using the same logic as jenkinsService.runJob
    const JENKINS_BASE_URL = 'https://echoqa.jenkins.int.godaddy.com';
    let queryString = `&Branch=${encodeURIComponent(branch)}&ENV=${encodeURIComponent(env)}&JiraID=${encodeURIComponent(jiraId || '')}`;
    
    if (browser && browser !== '--') {
        queryString += `&Browser=${encodeURIComponent(browser)}`;
    }
    
    if (tests && tests.trim()) {
        // Match the original logic: replace spaces with %2C (URL-encoded comma)
        queryString += `&Tests=${tests.replace(/ /g, '%2C')}`;
    }
    
    const buildUrl = `${JENKINS_BASE_URL}/job/${project}/buildWithParameters?token=crmftw${queryString}`;
    const projectUrl = `${JENKINS_BASE_URL}/job/${project}/`;
    
    // Open the build URL in a window, check content after 2 seconds
    // If blank, close and open Chrome; if it has content, keep it open
    window.electronAPI.openJobUrlAndChrome(buildUrl, projectUrl);
    showSuccess('Job URL opened. Checking page content...');
}

async function runIvrMaintenanceJob(env) {
    const JENKINS_BASE_URL = 'https://echoqa.jenkins.int.godaddy.com';
    
    // Build the maintenance job URL with correct format
    const buildUrl = `${JENKINS_BASE_URL}/job/qe-crm-api-ivr-dotnet-v2-Maintenance/buildWithParameters?token=crmftw&crmUser=&ENV=${env}`;
    const projectUrl = `${JENKINS_BASE_URL}/view/Maintenance/job/qe-crm-api-ivr-dotnet-v2-Maintenance/`;
    
    // Open the build URL in a window, check content after 2 seconds
    // If blank, close and open Chrome; if it has content, keep it open
    window.electronAPI.openJobUrlAndChrome(buildUrl, projectUrl);
    showSuccess(`IVR Maintenance job for ${env} opened. Checking page content...`);
}

async function postNightlyStats() {
    showLoading();
    try {
        const result = await window.electronAPI.postNightlyStats();
        showSuccess('Nightly Stats posted successfully. Jenkins job page opened.');
    } catch (error) {
        showError('Error posting nightly stats: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Utility functions
// Convert selected date to UTC date (add 1 day since data starts after 5pm MST and timestamps are UTC)
// When user selects 11/19, we want records with UTC date 11/20
function getUtcDateForSelectedDate(selectedDate) {
    const targetDate = new Date(selectedDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    return targetDate;
}

// Calculate date for recent discounts, handling weekends
// If the calculated date falls on a weekend, go back to the previous Friday
function getDateForRecentDiscounts(baseUtcDate, daysBack) {
    const targetDate = new Date(baseUtcDate);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysBack);
    
    // Get UTC components
    const utcYear = targetDate.getUTCFullYear();
    const utcMonth = targetDate.getUTCMonth();
    const utcDay = targetDate.getUTCDate();
    
    // Calculate day of week from UTC date components
    // Using a formula that works with UTC: day = (utcDay + Math.floor((utcMonth + 1) * 2.6) + utcYear + Math.floor(utcYear / 4) - Math.floor(utcYear / 100) + Math.floor(utcYear / 400)) % 7
    // Simplified: use Date.UTC to create date, then getDay() should work since Date stores UTC internally
    // Create date at UTC midnight - JavaScript Date.getDay() returns day of week
    // For UTC dates, we can use getDay() on a Date created with Date.UTC()
    const utcDate = new Date(Date.UTC(utcYear, utcMonth, utcDay));
    // getDay() returns 0-6 where 0=Sunday, 6=Saturday
    const dayOfWeek = utcDate.getDay();
    
    // If it's a weekend (Saturday = 6 or Sunday = 0), go back to Friday
    if (dayOfWeek === 0) { // Sunday
        targetDate.setUTCDate(targetDate.getUTCDate() - 2); // Go back 2 days to Friday
    } else if (dayOfWeek === 6) { // Saturday
        targetDate.setUTCDate(targetDate.getUTCDate() - 1); // Go back 1 day to Friday
    }
    
    return targetDate;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
}

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Track persistent database error to avoid duplicates
let persistentDbError = null;

function showError(message) {
    // Check if this is a database connection error
    const messageLower = message.toLowerCase();
    const isDbError = messageLower.includes('database connection') || 
                      messageLower.includes('database authentication') ||
                      messageLower.includes('cannot reach database') ||
                      messageLower.includes('connection timeout') ||
                      messageLower.includes('connection failed') ||
                      messageLower.includes('etimeout') ||
                      messageLower.includes('elogin') ||
                      messageLower.includes('esocket') ||
                      messageLower.includes('timeout') && (messageLower.includes('database') || messageLower.includes('connection'));
    
    if (isDbError) {
        showPersistentDbError(message);
    } else {
        // Show error in header
        const headerMessages = document.getElementById('headerMessages');
        headerMessages.innerHTML = '';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'header-message header-message-error';
        errorDiv.textContent = message;
        headerMessages.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

function showPersistentDbError(message) {
    // Remove existing persistent error if any
    if (persistentDbError) {
        persistentDbError.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message persistent-db-error';
    errorDiv.id = 'persistentDbError';
    
    const errorContent = document.createElement('div');
    errorContent.className = 'error-content';
    errorContent.textContent = message;
    
    const errorActions = document.createElement('div');
    errorActions.className = 'error-actions';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'error-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => {
        errorDiv.remove();
        persistentDbError = null;
    });
    
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary error-retry-btn';
    retryBtn.textContent = 'Retry Connection';
    retryBtn.addEventListener('click', async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Retrying...';
        
        try {
            // Reset the database connection pool
            await window.electronAPI.resetDbConnection();
            
            // Try to reload the failed tests to test the connection
            await loadFailedTests();
            
            // If successful, remove the error
            errorDiv.remove();
            persistentDbError = null;
            showSuccess('Database connection restored successfully');
        } catch (error) {
            // Update error message
            errorContent.textContent = 'Error retrying connection: ' + error.message;
            retryBtn.disabled = false;
            retryBtn.textContent = 'Retry Connection';
        }
    });
    
    errorActions.appendChild(closeBtn);
    errorActions.appendChild(retryBtn);
    
    errorDiv.appendChild(errorContent);
    errorDiv.appendChild(errorActions);
    
    document.body.insertBefore(errorDiv, document.body.firstChild);
    persistentDbError = errorDiv;
}

function showSuccess(message) {
    const headerMessages = document.getElementById('headerMessages');
    headerMessages.innerHTML = '';
    
    const successDiv = document.createElement('div');
    successDiv.className = 'header-message header-message-success';
    successDiv.textContent = message;
    headerMessages.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Settings modal functions
function openSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'block';
    
    // Load current theme setting
    loadThemeSetting();
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'none';
}

function loadThemeSetting() {
    const themePreference = localStorage.getItem('theme-preference') || 'auto';
    const themeSelect = document.getElementById('themeSelect');
    themeSelect.value = themePreference;
}

function handleThemeChange(e) {
    const selectedTheme = e.target.value;
    localStorage.setItem('theme-preference', selectedTheme);
    
    if (selectedTheme === 'auto') {
        // Remove manual override, use system preference
        localStorage.removeItem('theme-manual');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    } else {
        // Set manual theme
        localStorage.setItem('theme-manual', 'true');
        applyTheme(selectedTheme);
    }
    
    showSuccess(`Theme changed to ${selectedTheme === 'auto' ? 'Auto (System)' : selectedTheme}`);
}

// Theme management functions
function initializeTheme() {
    const themePreference = localStorage.getItem('theme-preference') || 'auto';
    
    if (themePreference === 'auto') {
        // Use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            // Only auto-switch if still set to auto
            const currentPreference = localStorage.getItem('theme-preference') || 'auto';
            if (currentPreference === 'auto') {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    } else {
        // Use manually set theme
        applyTheme(themePreference);
    }
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    
    // Save actual applied theme (for internal use)
    localStorage.setItem('theme', theme);
}

// Table sorting functionality
let currentSort = {
    table: null,
    column: null,
    direction: 'asc'
};

function setupTableSorting(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const headers = table.querySelectorAll('thead th');
    headers.forEach((header, index) => {
        // Skip the checkbox column (first column)
        if (index === 0) return;
        
        header.classList.add('sortable');
        header.addEventListener('click', () => {
            sortTable(tableId, index);
        });
    });
}

function sortTable(tableId, columnIndex) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Determine sort direction
    let direction = 'asc';
    if (currentSort.table === tableId && currentSort.column === columnIndex) {
        direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    }
    
    // Update sort state
    currentSort = { table: tableId, column: columnIndex, direction };
    
    // Remove sorting indicators from all headers
    const headers = table.querySelectorAll('thead th');
    headers.forEach(header => {
        header.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    // Add sorting indicator to current column
    headers[columnIndex].classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
    
    // Sort rows
    rows.sort((a, b) => {
        const cellA = a.cells[columnIndex];
        const cellB = b.cells[columnIndex];
        
        if (!cellA || !cellB) return 0;
        
        let valueA = cellA.textContent.trim();
        let valueB = cellB.textContent.trim();
        
        // Check if it's a checkbox column
        const checkboxA = cellA.querySelector('input[type="checkbox"]');
        const checkboxB = cellB.querySelector('input[type="checkbox"]');
        if (checkboxA && checkboxB) {
            valueA = checkboxA.checked ? '1' : '0';
            valueB = checkboxB.checked ? '1' : '0';
        }
        
        // Try to parse as numbers
        const numA = parseFloat(valueA);
        const numB = parseFloat(valueB);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            return direction === 'asc' ? numA - numB : numB - numA;
        }
        
        // Try to parse as dates
        const dateA = new Date(valueA);
        const dateB = new Date(valueB);
        
        if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
            return direction === 'asc' ? dateA - dateB : dateB - dateA;
        }
        
        // String comparison
        const comparison = valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' });
        return direction === 'asc' ? comparison : -comparison;
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
}

// Make rerunSingleTest available globally for onclick handlers
window.rerunSingleTest = rerunSingleTest;

