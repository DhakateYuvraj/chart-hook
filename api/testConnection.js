import firebasePool from '../lib/firebase-pool.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only accept GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      allowed: ['GET', 'POST', 'OPTIONS']
    });
  }
  
  const startTime = Date.now();
  
  try {
    console.log('🧪 Testing Firebase connection...');
    
    // Get environment info
    const envInfo = {
      timestamp: new Date().toISOString(),
      node_version: process.version,
      vercel_environment: process.env.VERCEL_ENV || 'development',
      region: process.env.VERCEL_REGION || 'local',
      firebase_service_account: {
        configured: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        length: process.env.FIREBASE_SERVICE_ACCOUNT?.length || 0,
        has_project_id: false,
        has_private_key: false
      },
      firebase_database_url: {
        configured: !!process.env.FIREBASE_DATABASE_URL,
        value: process.env.FIREBASE_DATABASE_URL || 'Not set'
      }
    };
    
    // Parse service account to get details
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        envInfo.firebase_service_account.has_project_id = !!serviceAccount.project_id;
        envInfo.firebase_service_account.has_private_key = !!serviceAccount.private_key;
        envInfo.firebase_service_account.project_id = serviceAccount.project_id;
        envInfo.firebase_service_account.client_email = serviceAccount.client_email;
      }
    } catch (parseError) {
      envInfo.firebase_service_account.parse_error = parseError.message;
    }
    
    // Test Firebase connection
    const connectionStart = Date.now();
    let connectionResult;
    
    try {
      connectionResult = await firebasePool.testConnection();
      const connectionTime = Date.now() - connectionStart;
      
      // Prepare success response
      const totalTime = Date.now() - startTime;
      
      return res.status(200).json({
        success: true,
        status: 'connected',
        message: 'Firebase connection successful',
        timestamp: new Date().toISOString(),
        timing: {
          total: totalTime,
          firebase_connection: connectionTime
        },
        firebase: {
          connected: true,
          project_id: envInfo.firebase_service_account.project_id,
          database_url: envInfo.firebase_database_url.value,
          test_data: connectionResult.data
        },
        environment: {
          node: envInfo.node_version,
          environment: envInfo.vercel_environment,
          region: envInfo.region
        },
        diagnostics: {
          service_account_valid: envInfo.firebase_service_account.has_project_id && 
                                  envInfo.firebase_service_account.has_private_key,
          database_url_valid: envInfo.firebase_database_url.configured,
          all_checks_passed: true
        },
        next_steps: [
          'Use POST /api/webhook to store data',
          'Use GET /api/read to view data',
          'Check https://console.firebase.google.com/ for database'
        ]
      });
      
    } catch (connectionError) {
      const connectionTime = Date.now() - connectionStart;
      const totalTime = Date.now() - startTime;
      
      console.error('Firebase connection test failed:', connectionError);
      
      // Determine the specific error
      let errorType = 'unknown';
      let statusCode = 500;
      let userMessage = 'Firebase connection failed';
      let debugInfo = {};
      
      if (connectionError.message.includes('environment variable')) {
        errorType = 'configuration';
        statusCode = 400;
        userMessage = 'Firebase environment variables not configured properly';
        debugInfo = {
          missing_variables: {
            FIREBASE_SERVICE_ACCOUNT: !envInfo.firebase_service_account.configured,
            FIREBASE_DATABASE_URL: !envInfo.firebase_database_url.configured
          }
        };
      } else if (connectionError.message.includes('JSON')) {
        errorType = 'invalid_json';
        statusCode = 400;
        userMessage = 'Invalid Firebase service account JSON';
        debugInfo = {
          parse_error: envInfo.firebase_service_account.parse_error,
          json_length: envInfo.firebase_service_account.length
        };
      } else if (connectionError.message.includes('permission') || 
                 connectionError.message.includes('authentication')) {
        errorType = 'authentication';
        statusCode = 401;
        userMessage = 'Firebase authentication failed - check service account credentials';
        debugInfo = {
          project_id: envInfo.firebase_service_account.project_id,
          client_email: envInfo.firebase_service_account.client_email
        };
      } else if (connectionError.message.includes('timeout')) {
        errorType = 'timeout';
        statusCode = 504;
        userMessage = 'Firebase connection timeout - check network or firewall';
      } else if (connectionError.message.includes('network') || 
                 connectionError.message.includes('ECONNREFUSED')) {
        errorType = 'network';
        statusCode = 503;
        userMessage = 'Network error connecting to Firebase';
      }
      
      return res.status(statusCode).json({
        success: false,
        status: 'failed',
        error_type: errorType,
        message: userMessage,
        debug_message: connectionError.message,
        timestamp: new Date().toISOString(),
        timing: {
          total: totalTime,
          firebase_connection: connectionTime
        },
        environment: envInfo,
        debug_info: debugInfo,
        troubleshooting_steps: getTroubleshootingSteps(errorType),
        immediate_actions: [
          'Check FIREBASE_SERVICE_ACCOUNT environment variable',
          'Verify FIREBASE_DATABASE_URL is correct',
          'Ensure service account has proper permissions in Firebase Console'
        ]
      });
    }
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('Unexpected error in testConnection:', error);
    
    return res.status(500).json({
      success: false,
      status: 'error',
      error_type: 'unexpected',
      message: 'Unexpected error during connection test',
      debug_message: error.message,
      timestamp: new Date().toISOString(),
      timing: {
        total: totalTime
      },
      stack_trace: process.env.NODE_ENV === 'production' ? undefined : error.stack,
      immediate_actions: [
        'Check server logs for detailed error',
        'Verify all environment variables are set',
        'Ensure Firebase project exists and database is enabled'
      ]
    });
  }
}

// Helper function to get troubleshooting steps based on error type
function getTroubleshootingSteps(errorType) {
  const steps = {
    configuration: [
      '1. Set FIREBASE_SERVICE_ACCOUNT environment variable with valid JSON',
      '2. Set FIREBASE_DATABASE_URL environment variable with your Firebase URL',
      '3. Restart the application after setting environment variables',
      '4. In Vercel, go to Settings → Environment Variables to configure'
    ],
    invalid_json: [
      '1. Ensure FIREBASE_SERVICE_ACCOUNT is a valid JSON string (minified, no line breaks)',
      '2. Use JSON.stringify() on the service account object',
      '3. Remove any special characters or line breaks',
      '4. Test JSON validity at https://jsonlint.com/'
    ],
    authentication: [
      '1. Verify service account has proper permissions in Firebase Console',
      '2. Ensure service account email exists in Firebase project',
      '3. Regenerate service account key in Firebase Console',
      '4. Check if service account key has expired'
    ],
    timeout: [
      '1. Check network connectivity to Firebase servers',
      '2. Verify firewall allows outbound connections to Firebase',
      '3. Try increasing timeout in code (default is 4 seconds)',
      '4. Check Firebase service status at https://status.firebase.google.com/'
    ],
    network: [
      '1. Check internet connectivity',
      '2. Verify DNS resolution for Firebase servers',
      '3. Check if running behind a proxy that blocks Firebase',
      '4. Try from different network or location'
    ],
    unknown: [
      '1. Check Firebase project exists and is active',
      '2. Verify Realtime Database is enabled in Firebase Console',
      '3. Check service account has "Firebase Admin SDK" role',
      '4. Review server logs for more details'
    ]
  };
  
  return steps[errorType] || steps.unknown;
}