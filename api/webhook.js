import firebasePool from "../lib/firebase-pool.js";
import { nanoid } from "nanoid";
import speakeasy from "speakeasy";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const Api = require("../lib/RestApi.cjs");
const authParamsString = process.env.SHOONYA_USER;
const authParamsString1 = process.env.SHOONYA_USER_1;
const authParamsString2 = process.env.SHOONYA_USER_2;

let authparams = {};
let authparams1 = {};
let authparams2 = {};
try {
  authparams = JSON.parse(authParamsString);
} catch (error) {
  console.log("Error in reading SHOONYA_USER", error);
}
try {
  authparams1 = authParamsString1 ? JSON.parse(authParamsString1) : null;
} catch (error) {
  console.log("Error in reading SHOONYA_USER_1", error);
}
try {
  authparams2 = authParamsString2 ? JSON.parse(authParamsString2) : null;
} catch (error) {
  console.log("Error in reading SHOONYA_USER_2", error);
}

// Helper to get date in YYYYMMDD format
function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

const storeInFbRealtime = async (payload, req, res) => {
  const startTime = Date.now();
  let firebaseInitTime = 0;
  let dbWriteTime = 0;
  const sourceDir = "chartink";
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
      source: sourceDir,
      ip:
        req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown",
    },
  };

  console.log(`📥 Received webhook: ID=${eventId}, DateDir=${dateDirectory}`);
  console.log(`payload=${JSON.stringify(enhancedPayload)}`);
  // 3. Initialize Firebase with timeout
  const initStart = Date.now();

  const initTimeout = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error("Firebase initialization timeout (3s)")),
      3000,
    );
  });

  const app = await Promise.race([firebasePool.initialize(), initTimeout]);

  firebaseInitTime = Date.now() - initStart;

  // 4. Store in Firebase with date-based organization
  const dbWriteStart = Date.now();
  const db = firebasePool.getDatabase();

  // Create multiple storage paths for easy querying
  const writePromises = [
    // Primary: Date-based directory (YYYYMMDD)
    db.ref(`${sourceDir}/${dateDirectory}/${eventId}`).set(enhancedPayload),
  ];

  // Race against timeout
  const writeTimeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Database write timeout (4s)")), 4000);
  });

  await Promise.race([Promise.all(writePromises), writeTimeout]);

  dbWriteTime = Date.now() - dbWriteStart;
  const totalTime = Date.now() - startTime;

  // 5. Success response
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({
    success: true,
    id: eventId,
    timestamp,
    dateDirectory: dateDirectory,
    storagePaths: {
      dateBased: `${sourceDir}/${dateDirectory}/${eventId}`,
    },
    timing: {
      total: totalTime,
      firebase_init: firebaseInitTime,
      db_write: dbWriteTime,
      remaining_timeout: 10000 - totalTime,
    },
    stored: true,
    note: totalTime > 8000 ? "⚠️ Close to timeout limit" : "✅ Within limits",
  });
};

const placeOrder = async (payload, userAuthParams, res) => {
  let SIGNAL_TYPE = null;
  const { alert_name = "", stocks: payloadStocks = "" } = payload || {};
  const ce_condition =
    alert_name.startsWith("CE-23.1") || alert_name.startsWith("CE-23.3");
  const pe_condition =
    alert_name.startsWith("PE-23.2") || alert_name.startsWith("PE-23.4");
  if (ce_condition) {
    SIGNAL_TYPE = "CE";
  } else if (pe_condition) {
    SIGNAL_TYPE = "PE";
  }

  if (SIGNAL_TYPE) {
    // Extract stocks safely
    const stocks = payloadStocks
      ? payloadStocks
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];

    if (!stocks.length) {
      console.log("❌ No stocks received");
      return { success: false, message: "No stocks received" };
    }

    try {
      // Generate TOTP
      const twoFA = speakeasy.totp({
        secret: userAuthParams.totp_key,
        encoding: "base32",
        time: Math.floor(Date.now() / 1000),
      });

      const api = new Api({});
      api.logout();

      // LOGIN with proper error handling
      console.log("🔐 Attempting login...");
      const loginResp = await api
        .login({
          ...userAuthParams,
          twoFA,
        })
        .catch((loginErr) => {
          console.error("❌ Login failed:", loginErr.message);
          throw new Error(`Login failed: ${loginErr.message}`);
        });

      if (!loginResp || loginResp.stat !== "Ok") {
        console.error("❌ Invalid login response:", loginResp);
        throw new Error(
          `Login response error: ${loginResp?.emsg || "Unknown error"}`,
        );
      }

      console.log(
        "✅ Login success:",
        loginResp.susertoken ? "Token received" : "No token",
      );

      // Process stocks sequentially
      const results = [];

      for (const stock of stocks) {
        try {
          console.log(`\n📈 Processing stock: ${stock}`);

          // Get future expiries
          const expiries = await api
            .get_future_expiries(stock, "NFO")
            .catch((err) => {
              console.error(
                `⚠️ Error fetching expiries for ${stock}:`,
                err.message,
              );
              return null;
            });

          if (!expiries) {
            console.log(`❌ Failed to get expiries for ${stock}`);
            results.push({ stock, success: false, error: "No expiries found" });
            continue;
          }

          api.get_quotes("NFO", expiries.token).then((reply) => {
            let optionParams = {
              tsym: reply.tsym, // Trading symbol (URL encode if needed: encodeURIComponent("M&M"))
              exch: "NFO", // Exchange (NFO for NSE F&O)
              strprc: reply.lp, // Mid price for strike selection
              cnt: 1, // 5 strikes on each side (total 20 contracts: 5CE + 5PE on each side)
            };
            api.get_option_chain(optionParams).then((reply) => {
              const selectedOption =
                reply?.values?.filter(
                  (item) => item.optt === SIGNAL_TYPE,
                )?.[0] || {};
              const {
                exch = "NFO",
                tsym = "",
                token = "",
                ls = 0,
              } = selectedOption || {};
              console.log("selectedOption +++++++++++++++", selectedOption);

              api
                .get_latest_candle("NFO", token, 1)
                .then((latestCandle) => {
                  console.log(
                    "latestCandlelatestCandlelatestCandlelatestCandle +++++++++++++++",
                    latestCandle,
                  );
                  let orderparams = {
                    buy_or_sell: "B", //Buy
                    product_type: "B", //BRACKET ORDER
                    exchange: exch,
                    tradingsymbol: tsym,
                    quantity: ls,
                    discloseqty: 0,
                    price_type: "LMT",
                    price: latestCandle?.close,
                    bookprofit_price: latestCandle?.close * 1.1,
                    bookloss_price: latestCandle?.close * 0.9,
                  };
                  console.log("orderparams +++++++++++++++", orderparams);
                  api.place_order(orderparams).then((reply) => {
                    results.push({ stock, success: true, reply: reply });
                    api.logout();
                    return;
                  });
                })
                .catch((error) => {
                  console.error("Error:", error.message);
                });
            });
          });
        } catch (stockError) {
          console.error(`❌ Error processing ${stock}:`, stockError.message);
          results.push({ stock, success: false, error: stockError.message });
        }

        // Add delay between stocks to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error("❌ Shoonya order flow failed:", error.message);
      console.error("Full error:", error);

      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      };
    }
  }
};

export default async function handler(req, res) {
  // Handle OPTIONS for CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  // Handle GET request - Show simple HTML status page
  if (req.method === "GET") {
    const startTime = Date.now();
    const todayDate = getDateString();

    try {
      const firebaseTest = await firebasePool.testConnection();
      const connectionTime = Date.now() - startTime;

      const envInfo = {
        nodeVersion: process.version,
        firebaseConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        firebaseUrl: process.env.FIREBASE_DATABASE_URL || "Not set",
        todayDate: todayDate,
      };

      const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chartink Webhook API</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body class="bg-light">
      <div class="container mt-4">
        <div class="row justify-content-center">
          <div class="col-lg-10">
            <div class="card shadow">
              <div class="card-header bg-primary text-white">
                <h1 class="h4 mb-0"><i class="fas fa-chart-line me-2"></i>Chartink Webhook API</h1>
              </div>
              
              <div class="card-body">
                <!-- Status Info -->
                <div class="row mb-4">
                  <div class="col-md-6">
                    <div class="alert ${firebaseTest.connected ? "alert-success" : "alert-danger"}">
                      <h4 class="alert-heading">
                        <i class="fas ${firebaseTest.connected ? "fa-check-circle" : "fa-times-circle"} me-2"></i>
                        Firebase: ${firebaseTest.connected ? "Connected" : "Failed"}
                      </h4>
                      <p class="mb-1">${firebaseTest.message}</p>
                      <small class="text-muted">Connection time: ${connectionTime}ms</small>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="alert alert-info">
                      <h4 class="alert-heading"><i class="fas fa-database me-2"></i>Storage</h4>
                      <p class="mb-1">Today: <code>chartink/${todayDate}/</code></p>
                      <p class="mb-0">Format: <code>YYYYMMDD</code></p>
                    </div>
                  </div>
                </div>

                <!-- Test Section -->
                <div class="card mb-4">
                  <div class="card-header bg-secondary text-white">
                    <h3 class="h5 mb-0"><i class="fas fa-vial me-2"></i>Test Webhook</h3>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label fw-bold">JSON Data:</label>
                      <textarea 
                        id="jsonInput" 
                        class="form-control font-monospace" 
                        rows="10"
                        placeholder='Enter JSON data here...'></textarea>
                    </div>
                    
                    <div class="d-flex flex-wrap gap-2 mb-3">
                      <button class="btn btn-primary" onclick="loadExample()">
                        <i class="fas fa-code me-1"></i>Load Example
                      </button>
                      <button class="btn btn-secondary" onclick="clearData()">
                        <i class="fas fa-eraser me-1"></i>Clear
                      </button>
                      <button class="btn btn-info text-white" onclick="formatJSON()">
                        <i class="fas fa-indent me-1"></i>Format JSON
                      </button>
                      <button class="btn btn-warning" onclick="validateJSON()">
                        <i class="fas fa-check-circle me-1"></i>Validate
                      </button>
                    </div>
                    
                    <div class="d-grid">
                      <button class="btn btn-success btn-lg" onclick="testWebhook()" id="testBtn">
                        <i class="fas fa-paper-plane me-2"></i>Test Webhook
                      </button>
                    </div>
                    
                    <div id="responseBox" class="mt-3"></div>
                  </div>
                </div>

                <!-- Endpoints -->
                <div class="card mb-4">
                  <div class="card-header bg-dark text-white">
                    <h3 class="h5 mb-0"><i class="fas fa-plug me-2"></i>API Endpoints</h3>
                  </div>
                  <div class="card-body">
                    <ul class="list-group list-group-flush">
                      <li class="list-group-item">
                        <span class="badge bg-primary me-2">GET</span>
                        <code>${req.headers.host}/api/webhook</code> - This page
                      </li>
                      <li class="list-group-item">
                        <span class="badge bg-success me-2">POST</span>
                        <code>${req.headers.host}/api/webhook</code> - Store data
                      </li>
                    </ul>
                    
                    <div class="mt-3">
                      <h6 class="fw-bold">Example cURL:</h6>
                      <pre class="bg-dark text-light p-3 rounded"><code>curl -X POST ${req.headers.origin || "https://" + req.headers.host}/api/webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "alert_name": "CE-23.3 StockFnO Buy Yuvraj",
    "scan_name": "CE-23.3 StockFnO Buy Yuvraj",
    "scan_url": "CE-23.3 StockFnO Buy Yuvraj",
    "stocks": "INFY",
    "trigger_prices": "1670",
    "triggered_at": "11:07 am",
    "webhook_url": "https://chartink-webhook.vercel.app/api/webhook"
}'</code></pre>
                    </div>
                  </div>
                </div>

                <!-- Config Info -->
                <div class="card">
                  <div class="card-header bg-warning">
                    <h3 class="h5 mb-0"><i class="fas fa-cog me-2"></i>Configuration</h3>
                  </div>
                  <div class="card-body">
                    <pre class="mb-0"><code>${JSON.stringify(envInfo, null, 2)}</code></pre>
                  </div>
                </div>
                
                <div class="text-center mt-4 text-muted">
                  <small>Last checked: ${new Date().toISOString()}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Initialize with example data
        const exampleData = ${JSON.stringify(
          {
            alert_name: "CE-23.3 StockFnO Buy Yuvraj",
            scan_name: "CE-23.3 StockFnO Buy Yuvraj",
            scan_url: "CE-23.3 StockFnO Buy Yuvraj",
            stocks: "INFY",
            trigger_prices: "1670",
            triggered_at: "11:07 am",
            webhook_url: "https://chartink-webhook.vercel.app/api/webhook",
          },
          null,
          2,
        )};
        
        document.getElementById('jsonInput').value = JSON.stringify(exampleData, null, 2);
        
        // Helper functions
        const helpers = {
          loadExample: () => document.getElementById('jsonInput').value = JSON.stringify(exampleData, null, 2),
          clearData: () => document.getElementById('jsonInput').value = '',
          formatJSON: () => {
            try {
              const textarea = document.getElementById('jsonInput');
              textarea.value = JSON.stringify(JSON.parse(textarea.value), null, 2);
              helpers.showMessage('JSON formatted successfully!', 'success');
            } catch (e) {
              helpers.showMessage('Invalid JSON: ' + e.message, 'danger');
            }
          },
          validateJSON: () => {
            try {
              JSON.parse(document.getElementById('jsonInput').value);
              helpers.showMessage('Valid JSON!', 'success');
            } catch (e) {
              helpers.showMessage('Invalid JSON: ' + e.message, 'danger');
            }
          },
          showMessage: (text, type) => {
            const box = document.getElementById('responseBox');
            box.innerHTML = \`
              <div class="alert alert-\${type} alert-dismissible fade show">
                <div class="d-flex align-items-center">
                  <i class="fas fa-\${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2"></i>
                  <div>\${text}</div>
                </div>
                <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
              </div>
            \`;
            if (type === 'success') setTimeout(() => box.innerHTML = '', 3000);
          }
        };
        
        // Assign to global scope
        Object.assign(window, helpers);
        
        // Main test function
        async function testWebhook() {
          const textarea = document.getElementById('jsonInput');
          const btn = document.getElementById('testBtn');
          let data;
          
          try {
            data = JSON.parse(textarea.value);
          } catch (e) {
            helpers.showMessage('Invalid JSON: ' + e.message, 'danger');
            return;
          }
          
          const originalHTML = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Testing...';
          
          try {
            const response = await fetch('/api/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
              helpers.showMessage(
                \`✅ Success! ID: \${result.id || 'N/A'} | Path: chartink/\${result.dateDirectory || 'N/A'}\`,
                'success'
              );
            } else {
              helpers.showMessage(\`❌ Error: \${result.error || response.statusText}\`, 'danger');
            }
          } catch (error) {
            helpers.showMessage('Network error: ' + error.message, 'danger');
          } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
          }
        }
        
        // Keyboard shortcut
        document.getElementById('jsonInput').addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.key === 'Enter') testWebhook();
        });
      </script>
    </body>
    </html>
    `;

      res.setHeader("Content-Type", "text/html");
      res.status(200).send(html);
    } catch (error) {
      console.error("GET handler error:", error);

      const html = `
    <html class="h-100">
    <head>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="h-100 bg-light">
      <div class="h-100 d-flex align-items-center justify-content-center">
        <div class="card shadow" style="width: 500px;">
          <div class="card-header bg-danger text-white">
            <h4 class="mb-0"><i class="fas fa-exclamation-triangle me-2"></i>API Error</h4>
          </div>
          <div class="card-body">
            <div class="alert alert-danger">
              <h5 class="alert-heading">${error.message}</h5>
              <p class="mb-0">Check Firebase configuration and try again.</p>
            </div>
            <button class="btn btn-primary w-100" onclick="location.reload()">
              <i class="fas fa-redo me-2"></i>Try Again
            </button>
          </div>
        </div>
      </div>
      <script>
        setTimeout(() => location.reload(), 5000);
      </script>
    </body>
    </html>
    `;

      res.setHeader("Content-Type", "text/html");
      res.status(500).send(html);
    }

    return;
  }

  // Handle POST request
  if (req.method !== "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(405).json({
      error: "Method not allowed",
      allowed: ["POST", "GET", "OPTIONS"],
    });
  }

  try {
    // 1. Parse and validate JSON
    let payload;
    try {
      payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (parseError) {
      return res.status(400).json({
        error: "Invalid JSON payload",
        message: parseError.message,
      });
    }
    if (!!authparams && !!authparams.userid) {
      await placeOrder(payload, authparams, res);
    }
    if (!!authparams1 && !!authparams1.userid) {
      await placeOrder(payload, authparams1, res);
    }
    if (!!authparams2 && !!authparams2.userid) {
      await placeOrder(payload, authparams2, res);
    }
    await storeInFbRealtime(payload, req, res);
  } catch (error) {
    console.error("Webhook error:", error);
    const startTime = Date.now();
    const elapsed = Date.now() - startTime;
    const timeLeft = 10000 - elapsed;

    const statusCode = timeLeft < 100 ? 504 : 500;

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(statusCode).json({
      error: "Processing failed",
      message: error.message,
      elapsed,
      timeLeft,
      suggestion:
        timeLeft < 1000
          ? "Consider using fallback storage"
          : "Check Firebase configuration",
    });
  }
}
