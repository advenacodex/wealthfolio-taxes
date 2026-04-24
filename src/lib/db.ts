import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.WF_DB_PATH || path.join(process.env.HOME || '', 'Library/Application Support/wealthfolio/wealthfolio.db');

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;

  console.log(`Connecting to database at: ${dbPath}`);
  
  if (!fs.existsSync(dbPath)) {
    console.error(`Database file NOT FOUND at: ${dbPath}`);
    throw new Error(`Database file not found at ${dbPath}. Check your volume mounting.`);
  }

  try {
    // Open in read-only mode to avoid locking issues with the main app
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    console.log('Database connected successfully');
    return db;
  } catch (error: any) {
    const diagnosticInfo = {
      path: dbPath,
      exists: fs.existsSync(dbPath),
      error: error.message,
      code: error.code,
      stack: error.stack
    };
    console.error('CRITICAL: Failed to open database', diagnosticInfo);
    
    // Create an error that carries the technical info
    const detailedError: any = new Error(`Database connection failed: ${error.message}`);
    detailedError.diagnosticInfo = diagnosticInfo;
    throw detailedError;
  }
}

export interface Account {
  id: string;
  name: string;
  currency: string;
}

export interface Asset {
  id: string;
  name: string;
  display_code?: string;
  instrument_symbol?: string;
}

export interface Activity {
  id: string;
  account_id: string;
  asset_id: string;
  activity_type: string;
  activity_date: string;
  quantity: string;
  unit_price: string;
  amount: string;
  fee: string;
  currency: string;
  fx_rate: string;
}
