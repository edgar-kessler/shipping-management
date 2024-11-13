// src/services/DatabaseService.js
import mysql from 'mysql2/promise';
import { DateTime } from 'luxon'; // Import Luxon

class DatabaseService {
  constructor() {
    // Initialize MySQL connection pool
    this.connection = mysql.createPool({
      host: '65.21.242.103',
      user: 'db_admin',
      password: '^j"2Tf"3N9&Mi6#_Ra/$',
      database: 'shipping-management',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  async getDb() {
    return this.connection;
  }

  async initializeDatabase() {
    const db = await this.getDb();

    await db.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        expires_at BIGINT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id TEXT,
        transaction_id TEXT,
        file_name TEXT,
        file_data TEXT,
        timestamp TEXT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS shipment_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_nr TEXT,
        status_code INT,
        message TEXT,
        timestamp TEXT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS shipments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        referenz TEXT,
        ship_to JSON,
        service JSON,
        document_record_id BIGINT,
        status_code INT DEFAULT NULL,
        transaction_identifier TEXT,
        shipment_charges JSON,
        tracking_nr TEXT,
        graphic_image TEXT,
        international_signature_graphic_image TEXT,
        benutzer TEXT,
        date_created TEXT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS shipment_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_nr TEXT,
        status_code INT,
        message TEXT,
        timestamp TEXT
      )
    `);

    console.info('Tables "tokens", "documents", "shipments", and "shipment_logs" successfully created or already exist in MySQL');
  }

  // Use Luxon to get the current time in Berlin timezone in "HH:mm:ss dd-MM-yyyy" format
  getCurrentBerlinTime() {
    return DateTime.now()
      .setZone('Europe/Berlin')
      .toFormat('HH:mm:ss dd-MM-yyyy');
  }

  async saveShipment(data) {
    const {
      ID, Referenz, ShipTo, Service, Document_record_id,
      StatusCode, TransactionIdentifier, ShipmentCharges,
      TrackingNr, GraphicImage, InternationalSignatureGraphicImage,
      Benutzer
    } = data;

    const dateCreated = this.getCurrentBerlinTime();

    const query = `
      INSERT INTO shipments (
        referenz, ship_to, service, document_record_id, status_code,
        transaction_identifier, shipment_charges, tracking_nr, 
        graphic_image, international_signature_graphic_image, benutzer, date_created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      Referenz, ShipTo, Service, Document_record_id, StatusCode,
      TransactionIdentifier, ShipmentCharges, TrackingNr, 
      GraphicImage, InternationalSignatureGraphicImage, Benutzer, dateCreated
    ];

    try {
      const db = await this.getDb();
      await db.query(query, params);
    } catch (error) {
      console.error('Error saving shipment:', error);
      throw error;
    }
  }

  async saveShipmentLog(endpoint, requestData, responseData, statusCode) {
    const timestamp = this.getCurrentBerlinTime();
    const query = `
      INSERT INTO shipment_logs (endpoint, request_data, response_data, status_code, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [
      endpoint,
      JSON.stringify(requestData),
      JSON.stringify(responseData),
      statusCode,
      timestamp
    ];
  
    try {
      const db = await this.getDb();
      await db.query(query, params);
    } catch (error) {
      console.error('Error saving shipment log:', error);
      throw error;
    }
  }

  async getLatestToken() {
    const db = await this.getDb();
    const [rows] = await db.query(
      `SELECT access_token, refresh_token, expires_at FROM tokens ORDER BY id DESC LIMIT 1`
    );
    return rows[0] || null;
  }
  async saveLog(endpoint, requestData, responseData, statusCode) {
    const timestamp = this.getCurrentBerlinTime();
    const query = `
      INSERT INTO logs_shipments (endpoint, request_data, response_data, status_code, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [
      endpoint,
      JSON.stringify(requestData),
      JSON.stringify(responseData),
      statusCode,
      timestamp
    ];

    try {
      const db = await this.getDb();
      await db.query(query, params);
    } catch (error) {
      console.error('Error saving log:', error);
      throw error;
    }
  }
}

export default new DatabaseService();
