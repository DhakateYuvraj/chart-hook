// lib/storage-manager.js
import firebasePool from './firebase-pool.js';
import { supabaseBackup } from './supabase-backup.js';

class StorageManager {
  constructor() {
    this.primaryStorage = 'firebase';
    this.fallbackStorage = 'supabase';
  }

  async storeData(payload, options = {}) {
    const {
      timeout = 5000,
      fallbackEnabled = true
    } = options;

    const storageStart = Date.now();
    
    try {
      // Try primary storage first
      if (this.primaryStorage === 'firebase') {
        try {
          const result = await this._storeInFirebase(payload, timeout);
          return {
            success: true,
            storage: 'firebase',
            data: result,
            time: Date.now() - storageStart
          };
        } catch (firebaseError) {
          if (!fallbackEnabled) throw firebaseError;
          
          console.warn('Firebase failed, trying fallback:', firebaseError.message);
          // Continue to fallback
        }
      }
      
      // Try fallback storage
      if (this.fallbackStorage === 'supabase' && fallbackEnabled) {
        const fallbackResult = await this._storeInSupabase(payload, timeout);
        return {
          success: true,
          storage: 'supabase_fallback',
          data: fallbackResult,
          time: Date.now() - storageStart
        };
      }
      
      throw new Error('All storage options failed');
      
    } catch (error) {
      // Emergency: Store in-memory cache or queue
      await this._emergencyStore(payload);
      
      return {
        success: false,
        error: error.message,
        storage: 'emergency_cache',
        time: Date.now() - storageStart
      };
    }
  }

  async _storeInFirebase(payload, timeout) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Firebase timeout')), timeout);
    });

    const app = await Promise.race([
      firebasePool.initialize(),
      timeoutPromise
    ]);

    const db = firebasePool.getDatabase();
    const id = Date.now().toString();
    
    const writePromise = db.ref(`chartink/${id}`).set({
      ...payload,
      stored_at: Date.now(),
      storage_method: 'firebase_primary'
    });

    return Promise.race([writePromise, timeoutPromise]);
  }

  async _storeInSupabase(payload, timeout) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Supabase timeout')), timeout);
    });

    return Promise.race([
      supabaseBackup.storeData(payload),
      timeoutPromise
    ]);
  }

  async _emergencyStore(payload) {
    // Store in memory (will be lost on cold start, but better than nothing)
    if (!global.emergencyCache) {
      global.emergencyCache = [];
    }
    
    global.emergencyCache.push({
      ...payload,
      cached_at: Date.now(),
      cached_in_memory: true
    });
    
    // Keep only last 100 items
    if (global.emergencyCache.length > 100) {
      global.emergencyCache.shift();
    }
    
    return { cached: true, count: global.emergencyCache.length };
  }
}

export const storageManager = new StorageManager();