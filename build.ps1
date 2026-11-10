$ErrorActionPreference = "Stop"

$html = Get-Content -Path index.html -Raw
$lines = $html -split "`r`n"
if ($lines.Count -lt 2) {
    # If the file uses only \n instead of \r\n, resplit
    $lines = $html -split "`n"
}

Write-Output "File loaded, total lines: $($lines.Count)"

$css = $lines[7..1007]
$navbar = $lines[1013..1204]
$sidebar = $lines[1207..1244]
$js = $lines[1440..2257]

# Save extracted parts
New-Item -ItemType Directory -Force -Path assets\css | Out-Null
New-Item -ItemType Directory -Force -Path assets\js | Out-Null
New-Item -ItemType Directory -Force -Path components | Out-Null

$css | Set-Content -Path assets\css\style.css
$navbar | Set-Content -Path components\navbar.html
$sidebar | Set-Content -Path components\sidebar.html

# Let's add API readiness to JS
$apiMock =  "`n`n// === API INTEGRATION READINESS ===`n" +
            "/**`n" +
            " * Generic API Fetch wrapper for future PHP/MySQL integration`n" +
            " * @param {string} endpoint - The API endpoint (e.g., 'get_users.php')`n" +
            " * @param {object} data - Data payload (optional)`n" +
            " * @param {string} method - HTTP method ('GET' or 'POST')`n" +
            " */`n" +
            "async function fetchAPI(endpoint, data = null, method = 'GET') {`n" +
            "    const url = '/api/' + endpoint;`n" +
            "    const options = {`n" +
            "        method: method,`n" +
            "        headers: {`n" +
            "            'Content-Type': 'application/json',`n" +
            "            'Accept': 'application/json'`n" +
            "        }`n" +
            "    };`n" +
            "    `n" +
            "    if (data && method !== 'GET') {`n" +
            "        options.body = JSON.stringify(data);`n" +
            "    }`n" +
            "    `n" +
            "    try {`n" +
            "        const response = await fetch(url, options);`n" +
            "        if (!response.ok) throw new Error('API Error: ' + response.status);`n" +
            "        return await response.json();`n" +
            "    } catch (error) {`n" +
            "        console.error('API Error:', error);`n" +
            "        throw error;`n" +
            "    }`n" +
            "}`n" +
            "`n" +
            "/**`n" +
            " * Global App Initialization`n" +
            " * Fetches and injects modular HTML components`n" +
            " */`n" +
            "document.addEventListener('DOMContentLoaded', async () => {`n" +
            "    try {`n" +
            "        // Load Navbar`n" +
            "        const navRes = await fetch('components/navbar.html');`n" +
            "        if(navRes.ok) {`n" +
            "            document.getElementById('navbar-container').innerHTML = await navRes.text();`n" +
            "        }`n" +
            "        `n" +
            "        // Load Sidebar`n" +
            "        const sideRes = await fetch('components/sidebar.html');`n" +
            "        if(sideRes.ok) {`n" +
            "            document.getElementById('sidebar-container').innerHTML = await sideRes.text();`n" +
            "        }`n" +
            "    } catch(err) {`n" +
            "        console.error('Failed to load components:', err);`n" +
            "    }`n" +
            "});`n"

$finalJs = @()
$finalJs += $js
$finalJs += $apiMock -split "`n"

$finalJs | Set-Content -Path assets\js\app.js

# Now rebuild index.html
$newHtml = @()
$newHtml += $lines[0..6]
$newHtml += '    <link rel="stylesheet" href="assets/css/style.css">'
$newHtml += $lines[1009..1012]
$newHtml += '    <div class="main-window">'
$newHtml += '        <div id="navbar-container"></div>'
$newHtml += '        <div class="dashboard-layout">'
$newHtml += '            <div id="sidebar-container"></div>'
$newHtml += $lines[1245..1439]
$newHtml += '    <script src="assets/js/app.js"></script>'
$newHtml += $lines[2259..2260]

$newHtml | Set-Content -Path index.html

# Modules
New-Item -ItemType Directory -Force -Path modules\admin | Out-Null
New-Item -ItemType Directory -Force -Path modules\inventory | Out-Null
New-Item -ItemType Directory -Force -Path modules\sales | Out-Null
New-Item -ItemType Directory -Force -Path modules\purchases | Out-Null

Write-Output "Done restructuring index.html"
