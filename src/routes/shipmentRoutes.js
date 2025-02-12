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
        PostalCode: String(Receiver.PostalCode), // Ensure PostalCode is a string
        Country: Receiver.Country,
        Phone: Receiver.Phone,
        Email: Receiver.Email,
        State: Receiver.State // Include State in the payload
      },
      Sender: {
        Company: Sender.Company,
        Name: Sender.Name,
        AddressLine1: Sender.AddressLine1,
        City: Sender.City,
        PostalCode: String(Sender.PostalCode), // Ensure PostalCode is a string
        Country: 'NL',
        Phone: Sender.Phone || '0000',
        Email: 'edgar.kessler@prokeepersline.com'
      },
      documentRecordId: documentRecordId
    };

    // Erstelle das Shipment über den ShipmentController
    const result = await ShipmentController.createShipment(shipmentData);

    res.json(result);
  } catch (error) {
    console.error('Fehler beim Erstellen des Shipments:', error);
    
    // Prüfe, ob es sich um einen UPS-Fehler handelt
    if (error.message && error.message.includes('UPS ERROR:')) {
      try {
        // Extrahiere den UPS-Fehler aus der Fehlermeldung
        const upsError = JSON.parse(error.message.replace('UPS ERROR: ', ''));
        return res.status(400).json({
          error: 'UPS Fehler',
          details: upsError.ShipmentResponse?.Response?.Error || upsError
        });
      } catch (parseError) {
        // Falls der JSON.parse fehlschlägt, sende die originale Fehlermeldung
        return res.status(400).json({
          error: error.message
        });
      }
    }
    
    // Für alle anderen Fehler
    res.status(500).json({
      error: 'Interner Server-Fehler',
      message: error.message
    });
  }
});

export default router;
