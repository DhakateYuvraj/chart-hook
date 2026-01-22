import firebasePool from '../lib/firebase-pool.js';

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Initialize Firebase pool early
  let db = null;
  try {
    // Initialize Firebase first
    await firebasePool.initialize();
    db = firebasePool.getDatabase();
  } catch (firebaseError) {
    console.error('Firebase initialization failed in read.js:', firebaseError.message);
    // Continue without Firebase - we'll handle it in each method
  }
  
  // Handle GET request - Show HTML interface
  if (req.method === 'GET') {
    try {
      // Get available dates for reference
      let availableDates = [];
      let connectionStatus = { connected: false, message: 'Not connected' };
      
      if (db) {
        try {
          const dates = await firebasePool.getAvailableDates();
          availableDates = dates.dates || [];
          connectionStatus = { connected: true, message: 'Connected to Firebase' };
        } catch (error) {
          console.log('Could not fetch available dates:', error.message);
          connectionStatus = { connected: false, message: error.message };
        }
      }
      
      // Get current date in YYYYMMDD format
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayDate = `${year}${month}${day}`;
      
      // Simple HTML page with free text input
      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Chartink Scanner Data Viewer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            color: #333;
            line-height: 1.6;
            padding: 20px;
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
          }
          
          header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          
          h1 {
            color: #2c3e50;
            margin-bottom: 10px;
          }
          
          .search-box {
            background: white;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
          }
          
          .form-group {
            margin-bottom: 20px;
          }
          
          label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #2c3e50;
          }
          
          input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.3s;
          }
          
          input[type="text"]:focus {
            outline: none;
            border-color: #3498db;
          }
          
          .btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
          }
          
          .btn:hover {
            background: #2980b9;
          }
          
          .btn-reset {
            background: #95a5a6;
            margin-left: 10px;
          }
          
          .btn-reset:hover {
            background: #7f8c8d;
          }
          
          .date-buttons {
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          
          .date-btn {
            background: #e8f4fc;
            border: 1px solid #3498db;
            color: #3498db;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
          }
          
          .date-btn:hover {
            background: #3498db;
            color: white;
          }
          
          .date-btn.active {
            background: #3498db;
            color: white;
          }
          
          .loading {
            display: none;
            text-align: center;
            padding: 20px;
          }
          
          .results-container {
            margin-top: 30px;
          }
          
          .stats {
            background: white;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          }
          
          .table-container {
            overflow-x: auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
          }
          
          th {
            background: #2c3e50;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
          }
          
          td {
            padding: 15px;
            border-bottom: 1px solid #e1e5e9;
          }
          
          tr:hover {
            background: #f8f9fa;
          }
          
          .alert-row {
            cursor: pointer;
          }
          
          .alert-row.expanded {
            background: #e8f4fc;
          }
          
          .details-row {
            background: #f8f9fa;
          }
          
          .details-table {
            width: 100%;
            background: white;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          }
          
          .details-table th {
            background: #3498db;
            padding: 10px;
            font-size: 14px;
          }
          
          .details-table td {
            padding: 8px 10px;
            font-size: 14px;
          }
          
          .empty-state {
            text-align: center;
            padding: 50px;
            color: #7f8c8d;
          }
          
          .scan-name {
            font-weight: 600;
            color: #2c3e50;
          }
          
          .stocks-count {
            background: #e8f4fc;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            color: #3498db;
          }
          
          .trigger-time {
            color: #27ae60;
            font-weight: 600;
          }
          
          .action-btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          
          .action-btn:hover {
            background: #2980b9;
          }
          
          .error {
            background: #fee;
            color: #c0392b;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid #c0392b;
          }
          
          .info {
            background: #e8f4fc;
            color: #2980b9;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid #3498db;
          }
          
          pre {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 6px;
            overflow-x: auto;
            font-size: 14px;
          }
          
          @media (max-width: 768px) {
            .btn-group {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            
            .btn-reset {
              margin-left: 0;
              margin-top: 10px;
            }
            
            table {
              font-size: 14px;
            }
            
            th, td {
              padding: 10px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <header>
            <h1>📊 Chartink Scanner Data Viewer</h1>
            <p>View and analyze your Chartink scanner alerts</p>
            <div style="margin-top: 10px; padding: 10px; background: ${connectionStatus.connected ? '#d4edda' : '#f8d7da'}; border-radius: 5px; display: inline-block;">
              Firebase: <strong>${connectionStatus.connected ? '✅ Connected' : '❌ Not Connected'}</strong>
            </div>
          </header>
          
          <div class="search-box">
            <h2 style="margin-bottom: 20px; color: #2c3e50;">🔍 Search Scanner Data</h2>
            
            <form id="searchForm">
              <div class="form-group">
                <label for="date">Date (YYYYMMDD):</label>
                <input type="text" id="date" name="date" 
                       placeholder="e.g., 20241215 or today" 
                       value="${todayDate}" required>
                <div class="date-buttons" id="dateButtons">
                  ${availableDates.slice(0, 10).map(date => `
                    <button type="button" class="date-btn" 
                            onclick="document.getElementById('date').value = '${date}'">
                      ${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}
                    </button>
                  `).join('')}
                  ${availableDates.length > 10 ? 
                    `<button type="button" class="date-btn" onclick="showAllDates()">+${availableDates.length - 10} more</button>` : 
                    ''}
                </div>
                <small style="color: #7f8c8d; display: block; margin-top: 5px;">
                  ${availableDates.length > 0 ? 
                    `${availableDates.length} dates available. Click above to select.` : 
                    'No data available yet. Enter a date in YYYYMMDD format.'}
                </small>
              </div>
              
              <div class="form-group">
                <label for="scan_name">Scanner Name (Optional):</label>
                <input type="text" id="scan_name" name="scan_name" 
                       placeholder="e.g., 8.13 + 5.1 R2 (ANY) or leave empty for all">
              </div>
              
              <div class="form-group">
                <label for="symbol">Stock Symbol (Optional):</label>
                <input type="text" id="symbol" name="symbol" 
                       placeholder="e.g., RELIANCE, TCS">
              </div>
              
              <div class="form-group">
                <label>Limit Results:</label>
                <input type="text" id="limit" name="limit" value="50" 
                       placeholder="Number of results to return">
              </div>
              
              <div class="btn-group">
                <button type="submit" class="btn">🔍 Search Data</button>
                <button type="button" class="btn btn-reset" onclick="resetForm()">🔄 Reset</button>
              </div>
            </form>
          </div>
          
          <div class="loading" id="loading">
            <div style="font-size: 18px; margin-bottom: 10px;">⏳ Loading data...</div>
            <div style="color: #7f8c8d;">Fetching scanner alerts from database</div>
          </div>
          
          <div class="results-container" id="resultsContainer" style="display: none;">
            <div class="stats" id="stats"></div>
            <div class="table-container">
              <table id="resultsTable">
                <thead>
                  <tr>
                    <th>Alert Name</th>
                    <th>Scanner</th>
                    <th>Stocks</th>
                    <th>Triggered At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="resultsBody">
                  <!-- Results will be populated here -->
                </tbody>
              </table>
            </div>
          </div>
          
          <div class="empty-state" id="emptyState" style="display: none;">
            <div style="font-size: 48px; margin-bottom: 20px;">📭</div>
            <h3>No Data Found</h3>
            <p>Try a different date or scanner name</p>
          </div>
          
          <div class="info">
            <h3>💡 How to Use</h3>
            <ul style="margin-top: 10px; padding-left: 20px;">
              <li>Enter a date in <strong>YYYYMMDD</strong> format (e.g., 20241215)</li>
              <li>Optionally filter by scanner name (partial match supported)</li>
              <li>Click on any row to see detailed stock prices</li>
              <li>Use the API for programmatic access (see below)</li>
            </ul>
            
            <h4 style="margin-top: 20px;">🔧 API Usage</h4>
            <pre>
// POST to search data
POST ${req.headers.host}/api/read
Content-Type: application/json

{
  "date": "20260120",
  "scan_name": "temp_testing",
  "symbol": "RELIANCE",
  "limit": 50
}

// Response format
{
  "success": true,
  "date": "20251209",
  "total": 10,
  "data": [...]
}
            </pre>
          </div>
        </div>
        
        <script>
          let expandedRows = new Set();
          let allDates = ${JSON.stringify(availableDates)};
          
          // Handle special date values
          function parseDateInput(dateStr) {
            if (!dateStr) return '';
            
            // Handle "today"
            if (dateStr.toLowerCase() === 'today') {
              const today = new Date();
              const year = today.getFullYear();
              const month = String(today.getMonth() + 1).padStart(2, '0');
              const day = String(today.getDate()).padStart(2, '0');
              return \`\${year}\${month}\${day}\`;
            }
            
            // Handle "yesterday"
            if (dateStr.toLowerCase() === 'yesterday') {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const year = yesterday.getFullYear();
              const month = String(yesterday.getMonth() + 1).padStart(2, '0');
              const day = String(yesterday.getDate()).padStart(2, '0');
              return \`\${year}\${month}\${day}\`;
            }
            
            // Clean the input (remove non-digits)
            const cleanDate = dateStr.replace(/[^0-9]/g, '');
            
            // If it's 8 digits, return as is
            if (cleanDate.length === 8) {
              return cleanDate;
            }
            
            // If it's 6 digits, assume YYMMDD and convert to YYYYMMDD
            if (cleanDate.length === 6) {
              const year = '20' + cleanDate.substring(0, 2);
              const month = cleanDate.substring(2, 4);
              const day = cleanDate.substring(4, 6);
              return \`\${year}\${month}\${day}\`;
            }
            
            // Try to parse various date formats
            try {
              const date = new Date(dateStr);
              if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return \`\${year}\${month}\${day}\`;
              }
            } catch (e) {
              // If parsing fails, return the cleaned date
            }
            
            return cleanDate;
          }
          
          document.getElementById('searchForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const dateInput = document.getElementById('date').value.trim();
            const scanName = document.getElementById('scan_name').value.trim();
            const symbol = document.getElementById('symbol').value.trim();
            const limit = document.getElementById('limit').value.trim() || '50';
            
            // Parse date input
            const parsedDate = parseDateInput(dateInput);
            
            if (!parsedDate) {
              alert('Please enter a valid date (YYYYMMDD format)');
              return;
            }
            
            if (parsedDate.length !== 8) {
              alert('Date must be in YYYYMMDD format (8 digits). You entered: ' + parsedDate);
              return;
            }
            
            const formData = {
              date: parsedDate,
              scan_name: scanName || undefined,
              symbol: symbol || undefined,
              limit: parseInt(limit) || 50
            };
            
            // Show loading, hide other sections
            document.getElementById('loading').style.display = 'block';
            document.getElementById('resultsContainer').style.display = 'none';
            document.getElementById('emptyState').style.display = 'none';
            
            try {
              console.log('Searching with:', formData);
              
              // Make POST request to our API
              const response = await fetch('/api/read', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
              });
              
              const data = await response.json();
              console.log('Response:', data);
              
              // Hide loading
              document.getElementById('loading').style.display = 'none';
              
              if (data.success && data.data && data.data.length > 0) {
                displayResults(data);
              } else {
                showEmptyState(data.message || 'No data found for the selected criteria');
              }
              
            } catch (error) {
              document.getElementById('loading').style.display = 'none';
              showError('Failed to fetch data: ' + error.message);
            }
          });
          
          function displayResults(result) {
            const statsDiv = document.getElementById('stats');
            const tbody = document.getElementById('resultsBody');
            
            // Update stats
            statsDiv.innerHTML = \`
              <strong>📊 Search Results:</strong>
              Date: <code>\${result.date}</code> | 
              Found: <strong>\${result.total}</strong> alerts | 
              Scanner: \${result.scan_name ? '<code>' + result.scan_name + '</code>' : 'All'} |
              Symbol: \${result.symbol ? '<code>' + result.symbol + '</code>' : 'All'} |
              Limit: \${result.metadata?.filters_applied?.limit || 50}
            \`;
            
            // Clear previous results
            tbody.innerHTML = '';
            expandedRows.clear();
            
            // Populate table
            result.data.forEach((alert, index) => {
              const row = document.createElement('tr');
              row.className = 'alert-row';
              row.dataset.index = index;
              
              // Extract data safely
              const alertName = alert.alert_name || alert.scan_name || 'N/A';
              const scanName = alert.scan_name || 'N/A';
              const stocks = alert.stocks ? alert.stocks.split(',') : [];
              const prices = alert.trigger_prices ? alert.trigger_prices.split(',') : [];
              const triggeredAt = alert.triggered_at || 'N/A';
              const scanUrl = alert.scan_url || '';
              const webhookUrl = alert.webhook_url || '';
              
              row.innerHTML = \`
                <td><strong>\${alertName}</strong></td>
                <td><span class="scan-name">\${scanName}</span></td>
                <td>
                  <span class="stocks-count">\${stocks.length} stocks</span>
                  <div style="margin-top: 5px; font-size: 12px; color: #666;">
                    \${stocks.slice(0, 3).map(s => \`<span style="background: #e8f4fc; padding: 2px 5px; margin-right: 5px; border-radius: 3px;">\${s.trim()}</span>\`).join('')}
                    \${stocks.length > 3 ? '...' : ''}
                  </div>
                </td>
                <td class="trigger-time">\${triggeredAt}</td>
                <td>
                  <button class="action-btn" onclick="toggleDetails(\${index}, this)">
                    📋 Show Details
                  </button>
                </td>
              \`;
              
              tbody.appendChild(row);
              
              // Add details row (hidden by default)
              const detailsRow = document.createElement('tr');
              detailsRow.className = 'details-row';
              detailsRow.id = 'details-' + index;
              detailsRow.style.display = 'none';
              
              // Calculate statistics
              const numericPrices = prices.map(p => parseFloat(p) || 0);
              const avgPrice = numericPrices.length > 0 ? 
                (numericPrices.reduce((a, b) => a + b, 0) / numericPrices.length).toFixed(2) : 0;
              const maxPrice = numericPrices.length > 0 ? Math.max(...numericPrices).toFixed(2) : 0;
              const minPrice = numericPrices.length > 0 ? Math.min(...numericPrices).toFixed(2) : 0;
              
              detailsRow.innerHTML = \`
                <td colspan="5">
                  <div style="padding: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                      <div>
                        <h5 style="color: #3498db; margin-bottom: 10px;">📋 Alert Info</h5>
                        <div style="background: white; padding: 15px; border-radius: 6px;">
                          <p><strong>Alert Name:</strong> \${alertName}</p>
                          <p><strong>Scanner:</strong> \${scanName}</p>
                          \${alert._metadata ? \`<p><strong>Received:</strong> \${new Date(alert._metadata.received_at).toLocaleString()}</p>\` : ''}
                        </div>
                      </div>
                      
                      <div>
                        <h5 style="color: #3498db; margin-bottom: 10px;">📊 Other Info</h5>
                        <div style="background: white; padding: 15px; border-radius: 6px;">
                          <p><strong>Triggered At:</strong> \${triggeredAt}</p>
                          <p><strong>Total Stocks:</strong> \${stocks.length}</p>
                        </div>
                      </div>
                    </div>
                    
                    <h5 style="color: #2c3e50; margin-bottom: 15px;">📋 Stock-Price Details (\${stocks.length} stocks)</h5>
                    <div style="overflow-x: auto;">
                      <table class="details-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Stock Symbol</th>
                            <th>Trigger Price (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          \${stocks.map((stock, i) => {
                            const price = numericPrices[i] || 0;
                            return \`
                              <tr>
                                <td>\${i + 1}</td>
                                <td><strong>\${stock.trim()}</strong></td>
                                <td>₹\${price.toFixed(2)}</td>
                              </tr>
                            \`;
                          }).join('')}
                        </tbody>
                      </table>
                    </div>
                    
                    <div style="margin-top: 20px; text-align: center;">
                      <button class="action-btn" onclick="exportData(\${index})">
                        📥 Export This Alert
                      </button>
                      <button class="action-btn" style="background: #95a5a6; margin-left: 10px;" onclick="toggleDetails(\${index}, this)">
                        🔼 Collapse
                      </button>
                    </div>
                  </div>
                </td>
              \`;
              
              tbody.appendChild(detailsRow);
            });
            
            // Show results container
            document.getElementById('resultsContainer').style.display = 'block';
          }
          
          function toggleDetails(index, button) {
            const detailsRow = document.getElementById('details-' + index);
            const mainRow = document.querySelector(\`tr[data-index="\${index}"]\`);
            
            if (expandedRows.has(index)) {
              // Collapse
              detailsRow.style.display = 'none';
              mainRow.classList.remove('expanded');
              button.textContent = '📋 Show Details';
              expandedRows.delete(index);
            } else {
              // Expand
              detailsRow.style.display = 'table-row';
              mainRow.classList.add('expanded');
              button.textContent = '🔼 Collapse';
              expandedRows.add(index);
            }
          }
          
          function showEmptyState(message) {
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('emptyState').innerHTML = \`
              <div style="font-size: 48px; margin-bottom: 20px;">📭</div>
              <h3>\${message}</h3>
              <p>Try a different date or scanner name</p>
            \`;
          }
          
          function showError(message) {
            const container = document.getElementById('resultsContainer');
            container.style.display = 'block';
            container.innerHTML = \`
              <div class="error">
                <h3>❌ Error</h3>
                <p>\${message}</p>
                <button class="btn" onclick="resetForm()">Try Again</button>
              </div>
            \`;
          }
          
          function resetForm() {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const todayDate = \`\${year}\${month}\${day}\`;
            
            document.getElementById('date').value = todayDate;
            document.getElementById('scan_name').value = '';
            document.getElementById('symbol').value = '';
            document.getElementById('limit').value = '50';
            document.getElementById('resultsContainer').style.display = 'none';
            document.getElementById('emptyState').style.display = 'none';
            expandedRows.clear();
          }
          
          function exportData(index) {
            const row = document.querySelector(\`tr[data-index="\${index}"]\`);
            const alertName = row.querySelector('td:first-child strong').textContent;
            
            // Create CSV data
            const stocks = [];
            const detailsRows = document.querySelectorAll(\`#details-\${index} .details-table tbody tr\`);
            
            detailsRows.forEach(tr => {
              const cells = tr.querySelectorAll('td');
              stocks.push({
                number: cells[0].textContent,
                symbol: cells[1].textContent,
                price: cells[2].textContent.replace('₹', '')
              });
            });
            
            const csvRows = [
              ['Stock #', 'Symbol', 'Trigger Price (₹)'],
              ...stocks.map(s => [s.number, s.symbol, s.price])
            ];
            
            const csvContent = csvRows.map(row => row.join(',')).join('\\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`chartink-\${alertName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-\${new Date().getTime()}.csv\`;
            a.click();
            
            alert(\`Exported \${alertName} data (\${stocks.length} stocks)\`);
          }
          
          function showAllDates() {
            const dateButtons = document.getElementById('dateButtons');
            dateButtons.innerHTML = allDates.map(date => \`
              <button type="button" class="date-btn" 
                      onclick="document.getElementById('date').value = '\${date}'">
                \${date.substring(0,4)}-\${date.substring(4,6)}-\${date.substring(6,8)}
              </button>
            \`).join('');
          }
        </script>
      </body>
      </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(html);
      
    } catch (error) {
      console.error('GET handler error:', error);
      
      const errorHtml = `
      <html>
      <body style="font-family: Arial; padding: 20px;">
        <h1>⚠️ Error Loading Data Viewer</h1>
        <div style="background: #fee; padding: 15px; border-radius: 5px;">
          <h3>${error.message}</h3>
          <p>Check Firebase configuration and try again.</p>
        </div>
      </body>
      </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.status(500).send(errorHtml);
    }
    
    return;
  }
  
  // Handle POST request - Return JSON data
  if (req.method === 'POST') {
    try {
      const { date, scan_name, symbol, limit = 100 } = req.body || {};
      
      console.log('POST request received:', { date, scan_name, symbol, limit });
      
      // Validate date parameter
      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Date parameter is required',
          expected: 'YYYYMMDD format (e.g., 20251209)'
        });
      }
      
      // Validate date format (YYYYMMDD)
      if (!date.match(/^\d{8}$/)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format',
          expected: 'YYYYMMDD (e.g., 20251209)',
          received: date
        });
      }
      
      // Check if Firebase is initialized
      if (!db) {
        // Try to initialize now
        try {
          await firebasePool.initialize();
          db = firebasePool.getDatabase();
        } catch (initError) {
          return res.status(500).json({
            success: false,
            error: 'Firebase initialization failed',
            message: initError.message,
            suggestion: 'Check Firebase environment variables and service account'
          });
        }
      }
      
      // Read data from Firebase
      const dateRef = db.ref(`chartink/${date}`);
      const snapshot = await dateRef.once('value');
      
      if (!snapshot.exists()) {
        return res.json({
          success: true,
          date: date,
          total: 0,
          message: 'No data found for this date',
          data: []
        });
      }
      
      let data = snapshot.val();
      let filteredData = [];
      
      // Convert object to array and apply filters
      Object.keys(data).forEach(key => {
        const scan = data[key];
        
        // Skip if scan is null or undefined
        if (!scan) return;
        
        // Check if this scan matches our filters
        let include = true;
        
        // Filter by scan_name (partial match, case-insensitive)
        if (scan_name && scan.scan_name) {
          const scanName = (scan.scan_name || '').toString().toLowerCase();
          const searchName = (scan_name || '').toString().toLowerCase();
          if (!scanName.includes(searchName)) {
            include = false;
          }
        } else if (scan_name && !scan.scan_name) {
          // If scan_name filter is provided but scan has no scan_name
          include = false;
        }
        
        // Filter by symbol (check in stocks string)
        if (symbol && scan.stocks) {
          const stocks = (scan.stocks || '').toString().toLowerCase().split(',');
          const searchSymbol = (symbol || '').toString().toLowerCase().trim();
          if (!stocks.some(s => s.trim() === searchSymbol)) {
            include = false;
          }
        }
        
        if (include) {
          filteredData.push(scan);
        }
      });
      
      // Sort by timestamp (newest first)
      filteredData.sort((a, b) => {
        const timeA = a._metadata?.received_at || 0;
        const timeB = b._metadata?.received_at || 0;
        return timeB - timeA;
      });
      
      // Apply limit
      const resultLimit = parseInt(limit) || 100;
      filteredData = filteredData.slice(0, resultLimit);
      
      // Parse stocks and prices for better structure
      const enhancedData = filteredData.map(alert => {
        const stocks = alert.stocks ? alert.stocks.split(',') : [];
        const prices = alert.trigger_prices ? alert.trigger_prices.split(',') : [];
        
        // Create stock-price pairs
        const stockDetails = stocks.map((stock, index) => ({
          symbol: stock.trim(),
          price: parseFloat(prices[index] || 0),
          priceFormatted: `₹${parseFloat(prices[index] || 0).toFixed(2)}`
        }));
        
        return {
          ...alert,
          stocks_count: stocks.length,
          stock_details: stockDetails,
          average_price: stockDetails.length > 0 ? 
            stockDetails.reduce((sum, s) => sum + s.price, 0) / stockDetails.length : 0,
          highest_price: stockDetails.length > 0 ? 
            Math.max(...stockDetails.map(s => s.price)) : 0,
          lowest_price: stockDetails.length > 0 ? 
            Math.min(...stockDetails.map(s => s.price)) : 0
        };
      });
      
      return res.json({
        success: true,
        date: date,
        scan_name: scan_name || null,
        symbol: symbol || null,
        total: enhancedData.length,
        data: enhancedData,
        metadata: {
          date_format: 'YYYYMMDD',
          filters_applied: {
            date: date,
            scan_name: scan_name || 'none',
            symbol: symbol || 'none',
            limit: resultLimit
          },
          firebase_status: 'connected'
        }
      });
      
    } catch (error) {
      console.error('POST handler error:', error);
      
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'Failed to fetch data',
        suggestion: 'Check Firebase configuration and ensure data exists for the specified date'
      });
    }
  }
}