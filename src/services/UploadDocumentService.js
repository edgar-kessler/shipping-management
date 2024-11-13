// src/services/UploadDocumentService.js

import fetch from 'node-fetch';
import OAuthService from './OAuthService.js';
import DatabaseService from './DatabaseService.js';

class UploadDocumentService {
  constructor() {
    this.baseUrl = 'https://onlinetools.ups.com';
    this.version = 'v2';
    this.shipperNumber = process.env.SHIPPER_NUMBER;
  }

  // Method to upload a document and save it to the MySQL database
  async uploadDocument(base64File, fileName, fileFormat = 'pdf', documentType = '002') {
    try {
      const accessToken = await OAuthService.getAccessToken();
      if (!accessToken) {
        throw new Error('No valid Access Token available.');
      }

      const transId = this.generateTransactionId();
      const url = `${this.baseUrl}/api/paperlessdocuments/${this.version}/upload`;

      const body = {
        UploadRequest: {
          Request: {
            TransactionReference: {
              CustomerContext: transId
            }
          },
          UserCreatedForm: [
            {
              UserCreatedFormFileName: fileName,
              UserCreatedFormFileFormat: fileFormat,
              UserCreatedFormDocumentType: documentType,
              UserCreatedFormFile: base64File
            }
          ],
          ShipperNumber: this.shipperNumber
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'transId': transId,
          'transactionSrc': 'testing',
          'ShipperNumber': this.shipperNumber,
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const documentId = data?.UploadResponse?.FormsHistoryDocumentID?.DocumentID[0];
      if (!documentId) {
        throw new Error('Error uploading document: DocumentID is missing in response.');
      }

      // Save the document to the MySQL database
      const db = await DatabaseService.getDb();
      const timestamp = new Date().toISOString();

      const [result] = await db.execute(
        `INSERT INTO documents (document_id, transaction_id, file_name, file_data, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        [documentId, transId, fileName, base64File, timestamp]
      );

      const recordId = result.insertId;
      console.log('Document successfully uploaded and saved in the database. Record ID:', recordId);

      return recordId;

    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  async getDocumentById(documentRecordId) {
    const db = await DatabaseService.getDb();
    const [documentData] = await db.execute(`SELECT document_id FROM documents WHERE id = ?`, [documentRecordId]);
    return documentData[0];
  }

  // Helper method to generate a unique transaction ID (32 characters)
  generateTransactionId() {
    return Math.random().toString(36).substring(2, 34).padEnd(32, '0');
  }
}

export default new UploadDocumentService();
