import express from 'express';
import ShipmentController from '../controllers/shipmentController.js';
import RatingService from '../services/RatingService.js';
import AIService from '../services/AIService.js';
import DatabaseService from '../services/DatabaseService.js';
import UploadDocumentService from '../services/UploadDocumentService.js';

const router = express.Router();

// Get cost savings summary
router.get('/cost_savings_summary', async (req, res) => {
  try {
    const summary = await DatabaseService.getCostSavingsSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error getting cost savings summary:', error);
    res.status(500).json({ error: 'Error retrieving cost savings summary.' });
  }
});

// Get rate estimates for a shipment
router.post('/get_rates', async (req, res) => {
  const { Receiver, Sender } = req.body;

  // Check for required fields
  if (!Receiver || !Sender) {
    return res.status(400).json({ error: 'Receiver and Sender information is required.' });
  }

  try {
    // Get rate options from UPS API
    const rateOptions = await RatingService.getRates(req.body);
    
    // Use AI to recommend the best service option
    const aiRecommendation = await AIService.getServiceRecommendation(rateOptions, req.body);
    
    res.json({
      rates: rateOptions,
      recommendation: {
        service: aiRecommendation.recommendedService,
        reason: aiRecommendation.reason,
        costSaving: aiRecommendation.costSaving,
        standardService: aiRecommendation.standardService,
        transitDays: {
          standard: aiRecommendation.standardService?.transitDays || 'Unknown',
          recommended: aiRecommendation.recommendedService?.transitDays || 'Unknown',
          difference: parseInt(aiRecommendation.recommendedService?.transitDays || 0) - 
                      parseInt(aiRecommendation.standardService?.transitDays || 0)
        }
      }
    });
  } catch (error) {
    console.error('Error getting rates:', error);
    // Extract UPS API error details if available
    const errorMessage = error.message || 'Error getting rate estimates.';
    const statusCode = error.statusCode || 500;
    const upsError = error.upsError || null;
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: upsError
    });
  }
});

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
        Phone: Sender.Phone || '0000'
      },
      documentRecordId: documentRecordId
    };

    // Erstelle das Shipment über den ShipmentController
    const result = await ShipmentController.createShipment(shipmentData);
    res.json(result);
  } catch (error) {
    console.error('Error creating shipment:', {
      error: error.message,
      stack: error.stack,
      details: error.upsError
    });
    
    // Prepare error response in German
    const errorResponse = {
      error: error.translatedMessage || `Fehler: ${error.message}`,
      details: {
        validationErrors: error.validationErrors?.map(err => ({
          code: err.code,
          field: err.code === '120206' ? 'Receiver.State' : undefined,
          message: err.message
        }))
      },
      solution: error.validationErrors?.[0]?.code === '120206'
        ? 'Bitte geben Sie einen gültigen Bundesland/Provinz-Code für die Lieferadresse an'
        : 'Bitte überprüfen Sie die angegebenen Daten'
    };
    
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

export default router;
