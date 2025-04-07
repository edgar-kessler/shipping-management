import fetch from 'node-fetch';
import OAuthService from '../services/OAuthService.js';
import DatabaseService from '../services/DatabaseService.js';
import UploadDocumentService from '../services/UploadDocumentService.js';
import RatingService from '../services/RatingService.js';
import AIService from '../services/AIService.js';
const aiService = new AIService(); // Create single instance
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
    let aiRecommendation;
    try {
      aiRecommendation = await aiService.getServiceRecommendation(rateOptions, shipmentData);
      console.log("AI Recommendation:", aiRecommendation);
    } catch (error) {
      if (error.message === 'No cost-saving options found') {
        console.log("No cost-saving options found, using standard service");
        const countryCode = shipmentData.Receiver.Country;
        const serviceCode = this.getServiceCode(countryCode);
        aiRecommendation = {
          recommendedService: rateOptions.find(opt => opt.serviceCode === serviceCode),
          reason: 'Using standard service as no cost-saving options were available'
        };
      } else {
        throw error;
      }
    }
    // Use the recommended service code
    const serviceCode = aiRecommendation.recommendedService.serviceCode;
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
    // Remove state/province for Germany and UK
    if (receiver.Country === 'DE' || receiver.Country === 'GB') {
      return '';
    }

    // Handle US states
    if (receiver.Country === 'US' && receiver.State) {
      try {
        // If already a 2-letter code, validate it exists
        if (receiver.State.length === 2) {
          const stateName = getStateCodeByStateName(receiver.State);
          if (stateName) {
            return receiver.State.toUpperCase(); // Return validated code
          }
        }
        
        // Convert full state name to code
        const stateCode = getStateCodeByStateName(receiver.State);
        if (stateCode) {
          console.log(`Converted ${receiver.State} to ${stateCode}`);
          return stateCode;
        }
        
        console.warn(`Unknown US state: ${receiver.State}`);
      } catch (error) {
        console.error(`State code conversion error: ${error.message}`);
      }
    }
    
    return receiver.State || '';
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
            Notification: {
              NotificationCode: '6',
              EMail: {
                EMailAddress: Receiver.Email
              }
            },
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
    const address = {
      Name: person.Company || person.Name,
      AttentionName: person.Name,
      ShipperNumber: shipperNumber,
      Phone: { Number: person.Phone || '0000' },
      Email: { EmailAddress: person.Email },
      Address: {
        AddressLine: [person.AddressLine1, person.AddressLine2 || '', person.AddressLine3 || ''].filter(Boolean),
        City: person.City,
        PostalCode: person.PostalCode,
        CountryCode: countryCode
      }
    };
    
    // Only include StateProvinceCode if it's not empty and not for DE/GB
    if (stateProvinceCode && countryCode !== 'DE' && countryCode !== 'GB') {
      address.Address.StateProvinceCode = stateProvinceCode;
    }
    
    return address;
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

      const responseData = await response.text();
      let parsedData;
      
      try {
        parsedData = JSON.parse(responseData);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseData}`);
      }

      if (!response.ok) {
        // Extract validation errors if present
        const validationErrors = parsedData?.response?.errors?.map(err => ({
          code: err.code,
          message: err.message,
          context: err.context
        })) || [];
        
        const error = new Error(
          validationErrors.length
            ? `UPS Validation Errors: ${validationErrors.map(e => e.message).join(', ')}`
            : `UPS API Error: ${response.status} ${response.statusText}`
        );
        
        error.statusCode = response.status;
        error.upsError = parsedData;
        error.validationErrors = validationErrors;
        
        console.error('UPS Shipment API Error:', {
          status: response.status,
          statusText: response.statusText,
          requestBody: requestBody, // Log the sent request for debugging
          errors: validationErrors.length ? validationErrors : parsedData
        });
        
        throw error;
      }

      return {
        data: parsedData,
        statusCode: response.status
      };
    } catch (error) {
      console.error('Error sending shipment request:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async handleShipmentResponse(response, shipmentData, transId, serviceCode, documentRecordId) {
    try {
      const { data, statusCode } = response;

      if (!data || typeof data !== 'object') {
        throw new Error(`Invalid UPS API response format: ${JSON.stringify(response)}`);
      }

      // Check for error response first
      if (data.response?.errors) {
        throw new Error(`UPS API Error: ${data.response.errors[0]?.message || 'Unknown error'}`);
      }

      if (!data.ShipmentResponse) {
        throw new Error(`Missing ShipmentResponse in UPS API response: ${JSON.stringify(data)}`);
      }

      const responseStatus = data.ShipmentResponse.Response?.ResponseStatus;
      if (!responseStatus || responseStatus.Code !== '1') {
        throw new Error(`UPS API Error: ${responseStatus?.Description || 'Unknown error'}`);
      }

      const shipmentResults = data.ShipmentResponse.ShipmentResults;
      if (!shipmentResults) {
        throw new Error('Missing ShipmentResults in UPS response');
      }

      const trackingNumber = shipmentResults.ShipmentIdentificationNumber;
      const packageResults = shipmentResults.PackageResults;
      const zplBase64 = packageResults?.ShippingLabel?.GraphicImage;

      if (!zplBase64 || !trackingNumber) {
        throw new Error('Missing required shipment data: Label or Tracking number');
      }

      await DatabaseService.saveShipment({
        ID: uuidv4(),
        Referenz: shipmentData.OrderNr,
        ShipTo: JSON.stringify(shipmentData.Receiver),
        Service: JSON.stringify({ Code: serviceCode, Description: this.getServiceDescription(serviceCode) }),
        Document_record_id: documentRecordId,
        StatusCode: statusCode,
        TransactionIdentifier: transId,
        ShipmentCharges: JSON.stringify({
          TotalCharges: {
            CurrencyCode: 'EUR',
            MonetaryValue: '0',
            ...(shipmentResults.NegotiatedRateCharges?.TotalCharges || {})
          },
          ...(shipmentResults.NegotiatedRateCharges || {})
        }),
        TrackingNr: trackingNumber,
        GraphicImage: zplBase64,
        InternationalSignatureGraphicImage: packageResults?.ShippingLabel?.InternationalSignatureGraphicImage,
        Benutzer: 'Test-User'
      });

      return {
        ZPLBase64: zplBase64,
        TrackingNumber: trackingNumber,
        DeliveryNoteNr: shipmentData.DeliveryNoteNr,
        Service: this.getServiceDescription(serviceCode)
      };
    } catch (error) {
      console.error('Error handling shipment response:', {
        error: error.message,
        shipmentData: shipmentData.OrderNr,
        stack: error.stack
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
