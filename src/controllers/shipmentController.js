import fetch from 'node-fetch';
import OAuthService from '../services/OAuthService.js';
import DatabaseService from '../services/DatabaseService.js';
import UploadDocumentService from '../services/UploadDocumentService.js';
import RatingService from '../services/RatingService.js';
import AIService from '../services/AIService.js';
import { v4 as uuidv4 } from 'uuid';
import { getStateCodeByStateName } from 'us-state-codes';

class ShipmentController {
  async createShipment(shipmentData) {
    const { OrderNr, DeliveryNoteNr, Receiver, Sender, documentRecordId } = shipmentData;
    console.log("Received documentRecordId:", documentRecordId);
    if (!documentRecordId) {
      throw new Error("documentRecordId is missing from shipmentData.");
    }

    const documentData = await UploadDocumentService.getDocumentById(documentRecordId);
    console.log("Fetched documentData:", documentData);

    if (!documentData) {
      throw new Error(`Document with ID ${documentRecordId} could not be found.`);
    }
    if (!documentData.document_id) {
      throw new Error(`Document with ID ${documentRecordId} has no valid document_id.`);
    }

    const documentId = documentData.document_id;
    console.log("Fetched documentId:", documentId);
    console.log(shipmentData.State);

    // Get rate options from UPS API
    console.log("Getting rate options for shipment...");
    const rateOptions = await RatingService.getRates(shipmentData);
    
    // Use AI to select the best service option
    console.log("Using AI to select the best service option...");
    const aiRecommendation = await AIService.getServiceRecommendation(rateOptions, shipmentData);
    console.log("AI Recommendation:", aiRecommendation);    
    // Use the recommended service code or fall back to default
    const serviceCode = aiRecommendation.recommendedService?.serviceCode || this.getServiceCode(shipmentData.Country);
    console.log(`Selected service: ${aiRecommendation.recommendedService?.serviceName} (${serviceCode})`);
    console.log(`Reason: ${aiRecommendation.reason}`);

    const accessToken = await this.getAccessToken();
    const transId = uuidv4();
    const stateProvinceCode = this.getStateCode(Receiver);
    const requestBody = this.buildRequestBody(shipmentData, stateProvinceCode, serviceCode, documentId);

    this.debugLog("Shipment Request", { url: this.getShipmentUrl(), headers: this.getHeaders(transId, accessToken), body: requestBody });

    const response = await this.sendShipmentRequest(requestBody, transId, accessToken);
    const result = await this.handleShipmentResponse(response, shipmentData, transId, serviceCode, documentRecordId);
    
    // Add AI recommendation to the result
    result.serviceRecommendation = {
      serviceName: aiRecommendation.recommendedService?.serviceName,
      reason: aiRecommendation.reason
    };
    
    return result;
  }

  async getAccessToken() {
    const accessToken = await OAuthService.getAccessToken();
    if (!accessToken) {
      throw new Error('Kein gültiger Access Token verfügbar.');
    }
    return accessToken;
  }

  getServiceCode(country) {
    return country === 'DE' || country === 'NL' || country === "ES" || country === 'BE' ? '11' : '65';
  }

  getStateCode(receiver) {
    if (receiver.Country === 'US' && receiver.State) {
      console.log(receiver.State.length > 2 ? getStateCodeByStateName(receiver.State) : receiver.State);
      return receiver.State.length > 2 ? getStateCodeByStateName(receiver.State) : receiver.State;
    }
    return receiver.State;
  }

  buildRequestBody(shipmentData, stateProvinceCode, serviceCode, documentId) {
    const { OrderNr, Receiver, Sender } = shipmentData;
    return {
      ShipmentRequest: {
        Request: {
          SubVersion: "1801",
          RequestOption: 'nonvalidate',
          TransactionReference: { CustomerContext: OrderNr }
        },
        Shipment: {
          Description: 'Goalkeeper Goods',
          Shipper: this.buildAddress(Sender, 'NL', process.env.SHIPPERNUMBER || 'G224H8'),
          ShipTo: this.buildAddress(Receiver, Receiver.Country, null, stateProvinceCode),
          ShipFrom: this.buildAddress(Sender, 'NL', null),
          PaymentInformation: {
            ShipmentCharge: {
              Type: '01',
              BillShipper: { AccountNumber: process.env.SHIPPERNUMBER || 'G224H8' }
            }
          },
          Service: { Code: serviceCode, Description: this.getServiceDescription(serviceCode) },
          Package: {
            Description: 'Goalkeeper Goods',
            Packaging: { Code: '02', Description: 'Box' },
            Dimensions: {
              UnitOfMeasurement: { Code: 'CM', Description: 'Centimeters' },
              Length: '10', Width: '10', Height: '10'
            },
            PackageWeight: { UnitOfMeasurement: { Code: 'KGS', Description: 'Kilograms' }, Weight: '1' }
          },
          ShipmentServiceOptions: {
            InternationalForms: {
              FormType: ['07'],
              UserCreatedForm: [{ DocumentID: [documentId] }]
            },
          },
          ShipmentRatingOptions: {
            NegotiatedRatesIndicator: "Y"
          },
          
          ReferenceNumber: [
            {
              Value: OrderNr.slice(0, 14)
            }
          ]
        },
        LabelSpecification: { LabelImageFormat: { Code: 'ZPL', Description: 'ZPL' }, LabelStockSize: { Height: '6', Width: '4' } }
      }
    };
  }

  buildAddress(person, countryCode, shipperNumber, stateProvinceCode = '') {
    return {
      Name: person.Company || person.Name,
      AttentionName: person.Name,
      ShipperNumber: shipperNumber,
      Phone: { Number: person.Phone || '0000' },
      Email: { EmailAddress: person.Email },
      Address: {
        AddressLine: [person.AddressLine1, person.AddressLine2 || '', person.AddressLine3 || ''].filter(Boolean),
        City: person.City,
        PostalCode: person.PostalCode,
        CountryCode: countryCode,
        StateProvinceCode: stateProvinceCode
      }
    };
  }

  getServiceDescription(serviceCode) {
    const serviceDescriptions = {
      '01': 'UPS Next Day Air',
      '02': 'UPS 2nd Day Air',
      '03': 'UPS Ground',
      '07': 'UPS Express',
      '08': 'UPS Expedited',
      '11': 'UPS Standard',
      '12': 'UPS 3 Day Select',
      '13': 'UPS Next Day Air Saver',
      '14': 'UPS Next Day Air Early',
      '54': 'UPS Express Plus',
      '59': 'UPS 2nd Day Air A.M.',
      '65': 'UPS Express Saver',
      '82': 'UPS Today Standard',
      '83': 'UPS Today Dedicated Courier',
      '84': 'UPS Today Intercity',
      '85': 'UPS Today Express',
      '86': 'UPS Today Express Saver',
      '96': 'UPS Worldwide Express Freight'
    };
    
    return serviceDescriptions[serviceCode] || 
           (serviceCode === 'DE' || serviceCode === 'NL' || serviceCode === 'BE' ? 'UPS Standard' : 'UPS Saver');
  }

  getShipmentUrl() {
    return "https://onlinetools.ups.com/api/shipments/v1/ship?additionaladdressvalidation=string";
  }

  getHeaders(transId, accessToken) {
    return {
      'Content-Type': 'application/json',
      'transId': transId,
      'transactionSrc': 'prod',
      'Authorization': `Bearer ${accessToken}`
    };
  }

  async sendShipmentRequest(requestBody, transId, accessToken) {
    try {
      const url = this.getShipmentUrl();
      const headers = this.getHeaders(transId, accessToken);

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let upsError = null;
        
        try {
          // Try to parse the error response as JSON
          upsError = JSON.parse(errorText);
        } catch (e) {
          // If not valid JSON, use the raw text
          upsError = { rawError: errorText };
        }
        
        // Create a custom error object with UPS error details
        const error = new Error(`UPS API Error: ${response.status} ${response.statusText}`);
        error.statusCode = response.status;
        error.upsError = upsError;
        
        // Log the error for debugging
        console.error('UPS Shipment API Error:', {
          status: response.status,
          statusText: response.statusText,
          details: upsError
        });
        
        throw error;
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending shipment request:', error);
      throw error;
    }
  }

  async handleShipmentResponse(response, shipmentData, transId, serviceCode, documentRecordId) {
    try {
      // Log the shipment response
      this.debugLog("Shipment Response", response);
      
      // Extract response data
      const data = response;
      
      // Create a log entry
      await DatabaseService.saveShipmentLog({
        orderNr: shipmentData.OrderNr,
        statusCode: 200,
        message: `Shipment created successfully. Tracking number: ${data.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber || 'N/A'}`
      });

      // Format the response data
      const formattedResponse = {
        ID: transId,
        Referenz: shipmentData.OrderNr,
        ShipTo: JSON.stringify(shipmentData.Receiver),
        Service: JSON.stringify({ ServiceCode: serviceCode }),
        Document_record_id: documentRecordId,
        StatusCode: 200,
        TransactionIdentifier: transId,
        ShipmentCharges: JSON.stringify(data.ShipmentResponse?.ShipmentResults?.ShipmentCharges || {}),
        TrackingNr: data.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber || '',
        GraphicImage: data.ShipmentResponse?.ShipmentResults?.PackageResults?.[0]?.ShippingLabel?.GraphicImage || '',
        InternationalSignatureGraphicImage: data.ShipmentResponse?.ShipmentResults?.Form?.GraphicImage || '',
        Benutzer: 'System'
      };

      // Save the shipment to the database
      await DatabaseService.saveShipment(formattedResponse);

      return formattedResponse;
    } catch (error) {
      console.error('Error handling shipment response:', error);
      
      // Log the error
      await DatabaseService.saveShipmentLog({
        orderNr: shipmentData.OrderNr,
        statusCode: error.statusCode || 500,
        message: `Error creating shipment: ${error.message}`
      });
      
      throw error;
    }
  }

  debugLog(title, details) {
    console.log(`DEBUG: ${title}`);
    console.log(JSON.stringify(details, null, 2));
  }
}

export default new ShipmentController();
