// src/services/DatabaseService.js

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

class DatabaseService {
  constructor() {
    this.db = null;
  }

  async initializeDatabase() {
    this.db = await open({
      filename: './database.sqlite',
      driver: sqlite3.Database
    });

    // Tokens-Tabelle
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER
      )
    `);

    // Documents-Tabelle
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT,
        transaction_id TEXT,
        file_name TEXT,
        file_data TEXT,
        timestamp TEXT
      )
    `);

    console.log('Tabellen "tokens" und "documents" erfolgreich erstellt oder existieren bereits');
  }

  async getDb() {
    if (!this.db) {
      await this.initializeDatabase();
    }
    return this.db;
  }
}

export default new DatabaseService();
