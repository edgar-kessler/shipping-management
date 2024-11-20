import fetch from 'node-fetch';
import OAuthService from '../services/OAuthService.js';
import DatabaseService from '../services/DatabaseService.js';
import UploadDocumentService from '../services/UploadDocumentService.js';
import { v4 as uuidv4 } from 'uuid';
import { getStateCodeByStateName } from 'us-state-codes';

class ShipmentController {
  async createShipment(shipmentData) {
    const { OrderNr, DeliveryNoteNr, Receiver, Sender, documentRecordId } = shipmentData;

    // Debugging logs to check if documentRecordId is undefined
    console.log("Received documentRecordId:", documentRecordId);
    if (!documentRecordId) {
      throw new Error("documentRecordId is missing from shipmentData.");
    }

    // Fetch documentData using documentRecordId
    const documentData = await UploadDocumentService.getDocumentById(documentRecordId);
    console.log("Fetched documentData:", documentData); // Log fetched documentData

    if (!documentData) {
      throw new Error(`Document with ID ${documentRecordId} could not be found.`);
    }
    if (!documentData.document_id) {
      throw new Error(`Document with ID ${documentRecordId} has no valid document_id.`);
    }

    const documentId = documentData.document_id;
    console.log("Fetched documentId:", documentId); // Log fetched documentId
    console.log(shipmentData.State);

    const accessToken = await this.getAccessToken();
    const transId = uuidv4();
    const serviceCode = this.getServiceCode(Receiver);
    const stateProvinceCode = this.getStateCode(Receiver);
    const requestBody = this.buildRequestBody(shipmentData, stateProvinceCode, serviceCode, documentId);

    this.debugLog("Shipment Request", { url: this.getShipmentUrl(), headers: this.getHeaders(transId, accessToken), body: requestBody });

    const response = await this.sendShipmentRequest(requestBody, transId, accessToken);
    return this.handleShipmentResponse(response, shipmentData, transId, serviceCode, documentRecordId);
  }

  async getAccessToken() {
    const accessToken = await OAuthService.getAccessToken();
    if (!accessToken) {
      throw new Error('Kein gültiger Access Token verfügbar.');
    }
    return accessToken;
  }

  getServiceCode(receiver) {

    if (receiver.Country === "DE" || receiver.Country === "NL" || receiver.Country === "BE") {
        return "11";
    }

    // Für alle anderen Länder sollte der Standard-Service-Code "65" gelten
    return "65";
  }


  getStateCode(receiver) {
    if (receiver.Country === 'US' && receiver.State) {
        // Debugging: Log den Eingabewert des States
        console.log(`Original State: ${receiver.State}`);
        
        // Wenn der State bereits 2 Buchstaben hat, unverändert zurückgeben
        if (receiver.State.length === 2) {
            console.log(`Returning existing 2-letter State Code: ${receiver.State}`);
            return receiver.State;
        }
        
        // Wenn der State länger als 2 Buchstaben ist, versuchen, den Namen zu konvertieren
        const stateCode = getStateCodeByStateName(receiver.State);
        if (!stateCode) {
            throw new Error(`Invalid state name: ${receiver.State}`);
        }
        console.log(`Converted State Name to Code: ${stateCode}`);
        return stateCode;
    }
    
    // Falls kein Land oder State angegeben ist, zurückgeben
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
          Service: { Code: serviceCode, Description: this.getServiceDescription(shipmentData.Country) },
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
            NegotiatedRatesIndicator: "Y" // Indicator to request negotiated rates if eligible
          },
          
          ReferenceNumber: [
            {
              Value: OrderNr.slice(0, 14) // Limit to 14 characters for compatibility
            }
          ]
        },
        LabelSpecification: { LabelImageFormat: { Code: 'ZPL', Description: 'ZPL' }, LabelStockSize: { Height: '6', Width: '4' } }
      }
    };
  }

  buildAddress(person, countryCode, shipperNumber, stateProvinceCode = '') {
    const includeStateProvince = !(countryCode === 'DE' || countryCode === 'UK'); // Exclude for DE and UK
    return {
        Name: person.Company || person.Name,
        AttentionName: person.Name,
        ShipperNumber: shipperNumber,
        Phone: { Number: person.Phone || '0000' },
        Address: {
            AddressLine: [person.AddressLine1, person.AddressLine2 || '', person.AddressLine3 || ''].filter(Boolean),
            City: person.City,
            PostalCode: person.PostalCode,
            CountryCode: countryCode,
            ...(includeStateProvince && { StateProvinceCode: stateProvinceCode }) // Include only if condition is met
        }
    };
  }


  getServiceDescription(receiver) {
    if (receiver.Country === "DE" || receiver.Country === "NL" || receiver.Country === "BE") {
      return "UPS Standard";
    }

    // Für alle anderen Länder sollte der Standard-Service-Code "65" gelten
    return "UPS Express Saver";
  }

  getShipmentUrl() {
    return "https://onlinetools.ups.com/api/shipments/v1/ship?additionaladdressvalidation=string";
  }

  getHeaders(transId, accessToken) {
    return {
      'Content-Type': 'application/json',
      'transId': transId,
      'transactionSrc': '',
      'Authorization': `Bearer ${accessToken}`
    };
  }

  async sendShipmentRequest(requestBody, transId, accessToken) {
    const response = await fetch(this.getShipmentUrl(), {
      method: 'POST',
      headers: this.getHeaders(transId, accessToken),
      body: JSON.stringify(requestBody)
    });
    const data = await response.json();
    this.debugLog("Shipment Response", { status: response.status, data });
    return { data, statusCode: response.status };
  }

  async handleShipmentResponse(response, shipmentData, transId, serviceCode, documentRecordId) {
    const { data, statusCode } = response;

    // Überprüfen, ob die UPS-Antwort erfolgreich ist
    const isSuccess = data?.ShipmentResponse?.Response?.ResponseStatus?.Code === '1';
    if (!isSuccess) {
        // Vollständigen Response zurückgeben, falls ein Fehler auftritt
        throw new Error(`UPS ERROR: ${JSON.stringify(data, null, 2)}`);
    }

    const shipmentResults = data.ShipmentResponse?.ShipmentResults;
    const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;
    const packageResults = shipmentResults?.PackageResults;
    const zplBase64 = packageResults?.ShippingLabel?.GraphicImage;
    const internationalSignatureGraphicImage = packageResults?.ShippingLabel?.InternationalSignatureGraphicImage;
    const shipmentCharges = JSON.stringify(shipmentResults?.NegotiatedRateCharges);

    if (!zplBase64 || !trackingNumber) {
        // Label oder Trackingnummer fehlt, vollständigen UPS-Response im Fehler zurückgeben
        throw new Error(`Fehler beim Erstellen des Shipments: Label oder Tracking-Nummer fehlt. UPS Response: ${JSON.stringify(data, null, 2)}`);
    }

    // Speichern in der Datenbank
    await DatabaseService.saveShipment({
        ID: uuidv4(),
        Referenz: shipmentData.OrderNr,
        ShipTo: JSON.stringify(shipmentData.Receiver),
        Service: JSON.stringify({ Code: serviceCode, Description: this.getServiceDescription(shipmentData.Receiver) }),
        Document_record_id: documentRecordId,
        StatusCode: statusCode,
        TransactionIdentifier: transId,
        ShipmentCharges: shipmentCharges,
        TrackingNr: trackingNumber,
        GraphicImage: zplBase64,
        InternationalSignatureGraphicImage: internationalSignatureGraphicImage,
        Benutzer: 'Test-User'
    });

    return {
        ZPLBase64: zplBase64,
        TrackingNumber: trackingNumber,
        DeliveryNoteNr: shipmentData.DeliveryNoteNr,
        Service: this.getServiceDescription(receiver)
    };
  }


  debugLog(title, details) {
    console.log(`DEBUG: ${title}`);
    console.log(JSON.stringify(details, null, 2));
  }
}

export default new ShipmentController();