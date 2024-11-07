
import express from 'express';
import ShipmentController from '../controllers/shipmentController.js';
import UploadDocumentService from '../services/UploadDocumentService.js';

const router = express.Router();

router.post('/create_shipment', async (req, res) => {
  const {
    OrderNr,
    DeliveryNoteNr,
    ReferenceNumber,
    Description,
    Receiver,
    Sender,
    documentRecordId
  } = req.body;

  console.log('Request Body:', req.body); // Loggt den gesamten Anfragebody

  // Prüfen auf erforderliche Felder
  if (!OrderNr || !DeliveryNoteNr || !Receiver || !Sender || !documentRecordId) {
    console.log('Fehlende Felder:', { OrderNr, DeliveryNoteNr, Receiver, Sender, documentRecordId });
    return res.status(400).json({ error: 'Einige erforderliche Felder fehlen.' });
  }

  try {
    // Abrufen der Document ID aus der Datenbank
    const documentData = await UploadDocumentService.getDocumentById(documentRecordId);
    if (!documentData || !documentData.document_id) {
      return res.status(404).json({ error: 'Document ID nicht gefunden.' });
    }

    // Fülle die Daten für das Shipment
    const shipmentData = {
      OrderNr,
      DeliveryNoteNr,
      ReferenceNumber,
      Description: Description || 'Goalkeeper Goods',
      Receiver: {
        Company: Receiver.Company,
        Name: Receiver.Name,
        AddressLine1: Receiver.AddressLine1,
        AddressLine2: Receiver.AddressLine2 || '',
        AddressLine3: Receiver.AddressLine3 || '',
        City: Receiver.City,
        PostalCode: Receiver.PostalCode,
        Country: Receiver.Country,
        Phone: Receiver.Phone,
        Email: Receiver.Email
      },
      Sender: {
        Company: Sender.Company,
        Name: Sender.Name,
        AddressLine1: Sender.AddressLine1,
        City: Sender.City,
        PostalCode: Sender.PostCode,
        Country: 'NL',
        Phone: Sender.Phone || '0000'
      },
      documentId: documentData.document_id
    };

    // Erstelle das Shipment über den ShipmentController
    const result = await ShipmentController.createShipment(shipmentData);

    res.json(result);
  } catch (error) {
    console.error('Fehler beim Erstellen des Shipments:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Shipments.' });
  }
});

export default router;
