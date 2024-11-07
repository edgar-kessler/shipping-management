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

  // Methode zum Hochladen eines Dokuments und Speichern in der Datenbank
  async uploadDocument(base64File, fileName, fileFormat = 'pdf', documentType = '002') {
    try {
      const accessToken = await OAuthService.getAccessToken();
      if (!accessToken) {
        throw new Error('Kein gültiger Access Token verfügbar.');
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
        throw new Error(`Fehler: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const documentId = data?.UploadResponse?.FormsHistoryDocumentID?.DocumentID[0];
      if (!documentId) {
        throw new Error('Fehler beim Hochladen des Dokuments: DocumentID fehlt in der Antwort.');
      }

      // Dokument in der Datenbank speichern
      const db = await DatabaseService.getDb();
      const timestamp = new Date().toISOString();

      const result = await db.run(
        `INSERT INTO documents (document_id, transaction_id, file_name, file_data, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        documentId,
        transId,
        fileName,
        base64File,
        timestamp
      );

      const recordId = result.lastID;
      console.log('Dokument erfolgreich hochgeladen und in der Datenbank gespeichert. Record ID:', recordId);

      return recordId;

    } catch (error) {
      console.error('Fehler beim Hochladen des Dokuments:', error);
      throw error;
    }
  }
  async getDocumentById(documentRecordId) {
    const db = await DatabaseService.getDb();
    const documentData = await db.get(`SELECT document_id FROM documents WHERE id = ?`, documentRecordId);
    return documentData;
  }

  // Hilfsmethode zum Generieren einer eindeutigen Transaktions-ID (32 Zeichen)
  generateTransactionId() {
    return Math.random().toString(36).substring(2, 34).padEnd(32, '0');
  }
}

export default new UploadDocumentService();
