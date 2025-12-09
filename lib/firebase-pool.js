import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Helper function to get date in YYYYMMDD format
export function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Global cache for Firebase
let cachedApp = null;
let cachedDb = null;
let isInitializing = false;

class FirebasePool {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
  }

  async initialize() {
    if (this.initialized && cachedApp) {
      return cachedApp;
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._initializeFirebase();
    return this.initializationPromise;
  }

  async _initializeFirebase() {
    try {
      console.log('🔥 Initializing Firebase...');
      
      // Check environment variables
      if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FIREBASE_DATABASE_URL) {
        throw new Error('Firebase environment variables not set');
      }
      
      // Parse service account
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (error) {
        throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT JSON');
      }
      
      if (!serviceAccount.project_id) {
        throw new Error('Invalid service account: missing project_id');
      }
      
      // Initialize app
      if (getApps().length === 0) {
        const app = initializeApp({
          credential: cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        cachedApp = app;
      } else {
        cachedApp = getApp();
      }
      
      cachedDb = getDatabase(cachedApp);
      this.initialized = true;
      
      console.log('✅ Firebase initialized successfully');
      return cachedApp;
      
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error.message);
      this.initializationPromise = null;
      throw error;
    }
  }

  getDatabase() {
    if (!this.initialized) {
      throw new Error('Firebase not initialized');
    }
    return cachedDb;
  }

  async testConnection() {
    try {
      const app = await this.initialize();
      const db = this.getDatabase();
      
      // Write a test record
      const testRef = db.ref('_connection_test');
      const testData = {
        timestamp: Date.now(),
        test: true,
        message: 'Firebase connection test',
        date: getDateString()
      };
      
      await testRef.set(testData);
      
      // Read it back
      const snapshot = await testRef.once('value');
      const data = snapshot.val();
      
      // Clean up
      await testRef.remove();
      
      return {
        connected: true,
        data: data,
        message: 'Firebase connection successful'
      };
      
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        message: 'Firebase connection failed'
      };
    }
  }

  // Helper to read data by date
  async getDataByDate(dateString) {
    try {
      const db = this.getDatabase();
      const dateRef = db.ref(`chartink/${dateString}`);
      const snapshot = await dateRef.once('value');
      
      if (!snapshot.exists()) {
        return { found: false, data: {}, message: 'No data for this date' };
      }
      
      const data = snapshot.val();
      const count = Object.keys(data || {}).length;
      
      return {
        found: true,
        date: dateString,
        count: count,
        data: data
      };
    } catch (error) {
      throw new Error(`Failed to read data for date ${dateString}: ${error.message}`);
    }
  }

  // Get all available dates
 async getAvailableDates() {
  try {
    const db = this.getDatabase();
    const chartinkRef = db.ref('chartink');
    const snapshot = await chartinkRef.once('value');
    
    if (!snapshot.exists()) {
      return { dates: [] };
    }
    
    const data = snapshot.val();
    // Get all keys that are 8-digit dates (YYYYMMDD)
    const dates = Object.keys(data).filter(key => key.match(/^\d{8}$/));
    
    return {
      dates: dates.sort().reverse() // Latest first
    };
  } catch (error) {
    console.error('Failed to get available dates:', error);
    return { dates: [] };
  }
}
}



// Create singleton instance
const firebasePool = new FirebasePool();
export default firebasePool;