import firebasePool from '../lib/firebase-pool.js';
import { nanoid } from 'nanoid';

// Helper to get date in YYYYMMDD format
function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export default async function handler(req, res) {
  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Handle GET request - Show simple HTML status page
  if (req.method === 'GET') {
    const startTime = Date.now();
    const todayDate = getDateString();
    
    try {
      // Test Firebase connection
      const firebaseTest = await firebasePool.testConnection();
      const connectionTime = Date.now() - startTime;
      
      // Get environment info
      const envInfo = {
        nodeVersion: process.version,
        firebaseConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        firebaseUrl: process.env.FIREBASE_DATABASE_URL || 'Not set',
        todayDate: todayDate
      };
      
      // Simple HTML response
      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Chartink Webhook API</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
          }
          .status {
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
          }
          .success {
            background: #d4edda;
            border-left: 5px solid #28a745;
          }
          .error {
            background: #f8d7da;
            border-left: 5px solid #dc3545;
          }
          .warning {
            background: #fff3cd;
            border-left: 5px solid #ffc107;
          }
          .info {
            background: #d1ecf1;
            border-left: 5px solid #17a2b8;
          }
          code {
            background: #f4f4f4;
            padding: 2px 5px;
            border-radius: 3px;
            font-family: monospace;
          }
          pre {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
          }
          .endpoint {
            margin: 20px 0;
            padding: 15px;
            background: #e9ecef;
            border-radius: 5px;
          }
          .test-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 10px;
          }
          .test-btn:hover {
            background: #0056b3;
          }
        </style>
      </head>
      <body>
        <h1>📊 Chartink Webhook API</h1>
        <p>Status: <strong>Online</strong></p>
        <p>Today's Date: <code>${todayDate}</code></p>
        
        <div class="status ${firebaseTest.connected ? 'success' : 'error'}">
          <h3>Firebase Connection: ${firebaseTest.connected ? '✅ Connected' : '❌ Failed'}</h3>
          <p>${firebaseTest.message}</p>
          <small>Connection time: ${connectionTime}ms</small>
        </div>
        
        <div class="status info">
          <h3>📦 Storage Structure</h3>
          <p>Data is organized by date in format: <code>YYYYMMDD</code></p>
          <p>Today's directory: <code>chartink/${todayDate}/</code></p>
          <p>Example path: <code>chartink/${todayDate}/scan_${Date.now()}_abc123</code></p>
        </div>
        
        <div class="endpoint">
          <h3>📬 API Endpoints</h3>
          <p><strong>GET</strong> <code>${req.headers.host}/api/webhook</code> - This page</p>
          <p><strong>POST</strong> <code>${req.headers.host}/api/webhook</code> - Store data</p>
          
          <h4>Example POST request:</h4>
          <pre>curl -X POST ${req.headers.origin || 'https://' + req.headers.host}/api/webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "alert_name": "Alert for 8.13 + 5.1 R2 (ANY)",
    "scan_name": "8.13 + 5.1 R2 (ANY)",
    "scan_url": "8-13-5-1-r2-any",
    "stocks": "HYUNDAI,KRN,CELLO,PPLPHARMA,PRINCEPIPE,AUBANK,ADANIENSOL,JWL,TITAGARH,EDELWEISS,DLF,INDIANB,TANLA,TORNTPOWER,ZYDUSLIFE,JINDALSTEL,GENUSPOWER,TATASTEEL,PATANJALI,LUPIN",
    "trigger_prices": "1911.4,769.45,623.75,208,327.3,707.85,890.75,406,915.5,103.01,784.3,598.7,581,1432.7,915.2,967.05,371.45,165.09,1732,1999.2",
    "triggered_at": "9:33 am",
    "webhook_url": "https://dummy-node-api-da9c.vercel.app/api/uploadData"
}'</pre>
          
          <button class="test-btn" onclick="testWebhook()">Test Webhook Now</button>
        </div>
        
        <div class="status warning">
          <h3>⚙️ Configuration</h3>
          <pre>${JSON.stringify(envInfo, null, 2)}</pre>
        </div>
        
        <p><small>Last checked: ${new Date().toISOString()}</small></p>
        
        <script>
          async function testWebhook() {
            const testData = {
    "alert_name": "Alert for 8.13 + 5.1 R2 (ANY)",
    "scan_name": "8.13 + 5.1 R2 (ANY)",
    "scan_url": "8-13-5-1-r2-any",
    "stocks": "HYUNDAI,KRN,CELLO,PPLPHARMA,PRINCEPIPE,AUBANK,ADANIENSOL,JWL,TITAGARH,EDELWEISS,DLF,INDIANB,TANLA,TORNTPOWER,ZYDUSLIFE,JINDALSTEL,GENUSPOWER,TATASTEEL,PATANJALI,LUPIN",
    "trigger_prices": "1911.4,769.45,623.75,208,327.3,707.85,890.75,406,915.5,103.01,784.3,598.7,581,1432.7,915.2,967.05,371.45,165.09,1732,1999.2",
    "triggered_at": "9:33 am",
    "webhook_url": "https://dummy-node-api-da9c.vercel.app/api/uploadData"
};
            
            try {
              const btn = event.target;
              btn.disabled = true;
              btn.textContent = 'Testing...';
              
              const response = await fetch('/api/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testData)
              });
              
              const result = await response.json();
              
              alert('✅ Test Successful!\\nScan ID: ' + result.id + '\\nStored in: chartink/' + result.dateDirectory);
              
            } catch (error) {
              alert('❌ Test Failed: ' + error.message);
            } finally {
              if (event.target) {
                event.target.disabled = false;
                event.target.textContent = 'Test Webhook Now';
              }
            }
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
        <h1>⚠️ Chartink Webhook Status</h1>
        <div style="background: #ffebee; padding: 15px; border-radius: 5px;">
          <h3>Error: ${error.message}</h3>
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

  // Handle POST request
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['POST', 'GET', 'OPTIONS']
    });
  }

  const startTime = Date.now();
  let firebaseInitTime = 0;
  let dbWriteTime = 0;

  try {
    // 1. Parse and validate JSON
    let payload;
    try {
      payload = typeof req.body === 'string' 
        ? JSON.parse(req.body) 
        : req.body;
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid JSON payload',
        message: parseError.message
      });
    }

    // 2. Generate metadata and date directory
    const eventId = nanoid(10);
    const timestamp = Date.now();
    const dateDirectory = getDateString(); // YYYYMMDD format
    
    const enhancedPayload = {
      ...payload,
      _metadata: {
        id: eventId,
        received_at: timestamp,
        date_directory: dateDirectory,
        source: 'chartink',
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
      }
    };

    // 3. Initialize Firebase with timeout
    const initStart = Date.now();
    
    const initTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Firebase initialization timeout (3s)')), 3000);
    });
    
    const app = await Promise.race([
      firebasePool.initialize(),
      initTimeout
    ]);
    
    firebaseInitTime = Date.now() - initStart;

    // 4. Store in Firebase with date-based organization
    const dbWriteStart = Date.now();
    const db = firebasePool.getDatabase();
    
    // Get date components for additional organization
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    
    // Create multiple storage paths for easy querying
    const writePromises = [
      // Primary: Date-based directory (YYYYMMDD)
      db.ref(`chartink/${dateDirectory}/${eventId}`).set(enhancedPayload),
      
      // Secondary: Year/Month/Day hierarchy for easy filtering
      db.ref(`chartink/by_date/${year}/${month}/${day}/${eventId}`).set(enhancedPayload),
      
      // Hourly organization (for intra-day analysis)
      db.ref(`chartink/by_hour/${dateDirectory}/${hours}/${eventId}`).set(enhancedPayload),
      
      // Latest scan reference
      db.ref(`chartink/latest`).set({
        id: eventId,
        timestamp,
        date_directory: dateDirectory,
        scan_name: payload.scan_name || 'unknown',
        symbol: payload.symbol || 'unknown',
        ...payload
      }),
      
      // Scan-type organization (if scan_name exists)
      ...(payload.scan_name ? [
        db.ref(`chartink/by_scan/${payload.scan_name}/${dateDirectory}/${eventId}`).set(enhancedPayload)
      ] : [])
    ];

    // Race against timeout
    const writeTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database write timeout (4s)')), 4000);
    });

    await Promise.race([
      Promise.all(writePromises),
      writeTimeout
    ]);
    
    dbWriteTime = Date.now() - dbWriteStart;
    const totalTime = Date.now() - startTime;

    // 5. Success response
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      success: true,
      id: eventId,
      timestamp,
      dateDirectory: dateDirectory,
      storagePaths: {
        dateBased: `chartink/${dateDirectory}/${eventId}`,
        hierarchical: `chartink/by_date/${year}/${month}/${day}/${eventId}`,
        hourly: `chartink/by_hour/${dateDirectory}/${hours}/${eventId}`,
        latest: 'chartink/latest'
      },
      timing: {
        total: totalTime,
        firebase_init: firebaseInitTime,
        db_write: dbWriteTime,
        remaining_timeout: 10000 - totalTime
      },
      stored: true,
      note: totalTime > 8000 ? '⚠️ Close to timeout limit' : '✅ Within limits'
    });

  } catch (error) {
    console.error('Webhook error:', error);
    
    const elapsed = Date.now() - startTime;
    const timeLeft = 10000 - elapsed;
    
    const statusCode = timeLeft < 100 ? 504 : 500;
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(statusCode).json({
      error: 'Processing failed',
      message: error.message,
      elapsed,
      timeLeft,
      suggestion: timeLeft < 1000 ? 'Consider using fallback storage' : 'Check Firebase configuration'
    });
  }
}