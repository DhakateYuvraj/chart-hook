// api/webhook-enhanced.js
import { storageManager } from '../lib/storage-manager.js';
import { nanoid } from 'nanoid';

export default async function handler(req, res) {
  const startTime = Date.now();
  
  // Immediately respond to OPTIONS
  if (req.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
  }

  if (req.method !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // 1. Quick JSON parsing with size limit
    const maxSize = 1024 * 10; // 10KB max
    if (req.headers['content-length'] > maxSize) {
      return {
        statusCode: 413,
        body: JSON.stringify({ error: 'Payload too large' })
      };
    }

    const payload = typeof req.body === 'string' 
      ? JSON.parse(req.body) 
      : req.body;

    // 2. Add minimal metadata
    const eventId = nanoid(10);
    const enhancedPayload = {
      data: payload,
      _webhook: {
        id: eventId,
        received: Date.now(),
        source: 'chartink'
      }
    };

    // 3. Store with adaptive timeout
    const timeLeft = 10000 - (Date.now() - startTime);
    const storageTimeout = Math.min(timeLeft - 1000, 6000); // Leave 1s buffer

    const storageResult = await storageManager.storeData(enhancedPayload, {
      timeout: storageTimeout,
      fallbackEnabled: true
    });

    const totalTime = Date.now() - startTime;

    // 4. Response based on storage result
    const response = {
      success: storageResult.success,
      id: eventId,
      storage: storageResult.storage,
      timing: {
        total: totalTime,
        storage: storageResult.time,
        remaining: 10000 - totalTime
      }
    };

    // Add warning if running low on time
    if (totalTime > 8000) {
      response.warning = 'High processing time, consider optimizing';
    }

    return {
      statusCode: storageResult.success ? 200 : 207, // 207 for partial success
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-ID': eventId,
        'X-Processing-Time': totalTime + 'ms'
      },
      body: JSON.stringify(response)
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    // Different error responses based on time left
    if (totalTime > 9500) {
      // Almost timeout - quick error
      return {
        statusCode: 504,
        body: JSON.stringify({ 
          error: 'Processing timeout',
          id: 'timeout_' + Date.now()
        })
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Processing failed',
        message: error.message,
        time: totalTime + 'ms'
      })
    };
  }
}