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

    // Shipments-Tabelle
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_nr TEXT,
        delivery_note_nr TEXT,
        tracking_number TEXT,
        service TEXT,
        label_zpl_base64 TEXT,
        shipment_charges TEXT,
        date_created TEXT,
        document_record_id INTEGER,
        transaction_identifier TEXT,
        error_message TEXT,
        status_code INTEGER DEFAULT NULL
      )
    `);

    // Shipment Logs-Tabelle
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS shipment_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_nr TEXT,
        status_code INTEGER,
        message TEXT,
        timestamp TEXT
      )
    `);

    console.info('Tabellen "tokens", "documents", "shipments" und "shipment_logs" erfolgreich erstellt oder existieren bereits');
  }

  async getDb() {
    if (!this.db) {
      await this.initializeDatabase();
    }
    return this.db;
  }

  // Methode zum Speichern von Shipments
  async saveShipment(data) {
    const {
      orderNr, deliveryNoteNr, trackingNumber, service, labelZPLBase64,
      shipmentCharges, documentRecordId, transactionIdentifier, errorMessage, statusCode
    } = data;

    const dateCreated = new Date().toISOString();

    const query = `
      INSERT INTO shipments (
        order_nr, delivery_note_nr, tracking_number, service, label_zpl_base64,
        shipment_charges, date_created, document_record_id, transaction_identifier, error_message, status_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      orderNr, deliveryNoteNr, trackingNumber, service, labelZPLBase64,
      shipmentCharges, dateCreated, documentRecordId, transactionIdentifier, errorMessage, statusCode
    ];

    try {
      const db = await this.getDb();
      await db.run(query, params);
    } catch (error) {
      console.error('Error saving shipment:', error);
      throw error;
    }
  }

  // Methode zum Speichern von Shipment Logs
  async saveShipmentLog(data) {
    const {
      orderNr, statusCode, message
    } = data;

    const timestamp = new Date().toISOString();

    const query = `
      INSERT INTO shipment_logs (
        order_nr, status_code, message, timestamp
      ) VALUES (?, ?, ?, ?)
    `;

    const params = [
      orderNr, statusCode, message, timestamp
    ];

    try {
      const db = await this.getDb();
      await db.run(query, params);
    } catch (error) {
      console.error('Error saving shipment log:', error);
      throw error;
    }
  }
}

export default new DatabaseService();
