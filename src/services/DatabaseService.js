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

    await db.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id TEXT,
        rating_data JSON,
        timestamp TEXT,
        ai_recommendation JSON
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS cost_savings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        country_code VARCHAR(2),
        standard_service_code VARCHAR(10),
        standard_service_name VARCHAR(50),
        standard_service_cost DECIMAL(10,2),
        standard_transit_days INT,
        selected_service_code VARCHAR(10),
        selected_service_name VARCHAR(50),
        selected_service_cost DECIMAL(10,2),
        selected_transit_days INT,
        transit_days_difference INT,
        savings_amount DECIMAL(10,2),
        savings_percentage DECIMAL(5,2),
        currency VARCHAR(3),
        shipment_reference VARCHAR(50),
        ai_recommended TINYINT(1),
        timestamp TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.info('Tables "tokens", "documents", "shipments", "shipment_logs", "ratings", and "cost_savings" successfully created or already exist in MySQL');
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

  async saveShipmentLog(data) {
    const {
      orderNr, statusCode, message
    } = data;

    const timestamp = this.getCurrentBerlinTime();

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
      await db.query(query, params);
    } catch (error) {
      console.error('Error saving shipment log:', error);
      throw error;
    }
  }

  async getCostSavingsSummary() {
    try {
      const db = await this.getDb();
      
      // First verify the cost_savings table exists
      const [tables] = await db.query(`
        SHOW TABLES LIKE 'cost_savings'
      `);
      
      if (tables.length === 0) {
        return {
          error: 'cost_savings table does not exist',
          tables: await this.listTables()
        };
      }

      // Check if table has any data
      const [rowCount] = await db.query(`
        SELECT COUNT(*) as count FROM cost_savings
      `);
      
      if (rowCount[0].count === 0) {
        return {
          message: 'No cost savings data available',
          tableStructure: await this.getTableStructure('cost_savings')
        };
      }

      try {
        // Get total savings by country
        const [countrySummary] = await db.query(`
          SELECT
            country_code,
            COUNT(*) as shipment_count,
            SUM(savings_amount) as total_savings,
            AVG(savings_percentage) as avg_savings_percentage,
            AVG(transit_days_difference) as avg_transit_days_difference,
            COUNT(CASE WHEN transit_days_difference > 0 THEN 1 END) as delayed_shipments,
            COUNT(CASE WHEN transit_days_difference = 0 THEN 1 END) as same_time_shipments,
            COUNT(CASE WHEN transit_days_difference < 0 THEN 1 END) as faster_shipments,
            currency
          FROM cost_savings
          GROUP BY country_code, currency
          ORDER BY total_savings DESC
        `);
        
        // Get total savings by service
        const [serviceSummary] = await db.query(`
          SELECT
            selected_service_name,
            COUNT(*) as usage_count,
            SUM(savings_amount) as total_savings,
            AVG(savings_percentage) as avg_savings_percentage,
            AVG(transit_days_difference) as avg_transit_days_difference,
            currency
          FROM cost_savings
          GROUP BY selected_service_name, currency
          ORDER BY total_savings DESC
        `);
        
        // Get overall total
        const [overallSummary] = await db.query(`
          SELECT
            COUNT(*) as total_shipments,
            SUM(savings_amount) as total_savings,
            AVG(savings_percentage) as avg_savings_percentage,
            AVG(transit_days_difference) as avg_transit_days_difference,
            COUNT(CASE WHEN transit_days_difference > 0 THEN 1 END) as delayed_shipments,
            COUNT(CASE WHEN transit_days_difference = 0 THEN 1 END) as same_time_shipments,
            COUNT(CASE WHEN transit_days_difference < 0 THEN 1 END) as faster_shipments,
            currency
          FROM cost_savings
          GROUP BY currency
        `);
        
        // Get transit days impact summary
        const [transitDaysSummary] = await db.query(`
          SELECT
            transit_days_difference,
            COUNT(*) as shipment_count,
            SUM(savings_amount) as total_savings,
            AVG(savings_percentage) as avg_savings_percentage,
            currency
          FROM cost_savings
          GROUP BY transit_days_difference, currency
          ORDER BY transit_days_difference
        `);
        
        return {
          byCountry: countrySummary,
          byService: serviceSummary,
          byTransitDays: transitDaysSummary,
          overall: overallSummary,
          totalRecords: rowCount[0].count
        };
      } catch (queryError) {
        console.error('Query error in getCostSavingsSummary:', {
          error: queryError,
          sql: queryError.sql,
          parameters: queryError.parameters
        });
        return {
          error: 'Failed to execute cost savings queries',
          queryError: queryError.message,
          tableStructure: await this.getTableStructure('cost_savings')
        };
      }
    } catch (error) {
      console.error('Database error in getCostSavingsSummary:', {
        error: error.message,
        stack: error.stack,
        connection: await this.checkConnection()
      });
      throw error;
    }
  }

  async listTables() {
    try {
      const db = await this.getDb();
      const [tables] = await db.query('SHOW TABLES');
      return tables.map(table => table[`Tables_in_${this.connection.config.database}`]);
    } catch (error) {
      console.error('Error listing tables:', error);
      throw error;
    }
  }

  async getTableStructure(tableName) {
    try {
      const db = await this.getDb();
      const [structure] = await db.query(`DESCRIBE ${tableName}`);
      return structure;
    } catch (error) {
      console.error(`Error getting structure for table ${tableName}:`, error);
      return { error: `Could not describe table ${tableName}` };
    }
  }

  async checkConnection() {
    try {
      const db = await this.getDb();
      await db.query('SELECT 1');
      return { status: 'connected', database: this.connection.config.database };
    } catch (error) {
      return {
        status: 'disconnected',
        error: error.message,
        config: {
          host: this.connection.config.host,
          database: this.connection.config.database
        }
      };
    }
  }

  async getLatestToken() {
    const db = await this.getDb();
    const [rows] = await db.query(
      `SELECT access_token, refresh_token, expires_at FROM tokens ORDER BY id DESC LIMIT 1`
    );
    return rows[0] || null;
  }
}

export default new DatabaseService();
