import fetch from 'node-fetch';
import OAuthService from '../services/OAuthService.js';
import DatabaseService from '../services/DatabaseService.js';
import UploadDocumentService from '../services/UploadDocumentService.js';
import { v4 as uuidv4 } from 'uuid';
import { getStateCodeByStateName } from 'us-state-codes';

class ShipmentController {
  async createShipment(shipmentData) {
    const { OrderNr, DeliveryNoteNr, Receiver, Sender, documentRecordId } = shipmentData;
    if (!documentRecordId) {
      await DatabaseService.saveShipmentLog(
        "Create Shipment - Missing documentRecordId",
        shipmentData,
        { error: "documentRecordId is missing from shipmentData." },
        400
      );
      throw new Error("documentRecordId is missing from shipmentData.");
    }

    await DatabaseService.saveShipmentLog(
      "Create Shipment - Initiated",
      shipmentData,
      { message: "Shipment creation process started." },
      100
    );

    const documentData = await UploadDocumentService.getDocumentById(documentRecordId);
    if (!documentData || !documentData.document_id) {
      const errorMessage = `Document with ID ${documentRecordId} has no valid document_id.`;
      await DatabaseService.saveShipmentLog(
        "Create Shipment - Invalid Document",
        shipmentData,
        { error: errorMessage },
        404
      );
      throw new Error(errorMessage);
    }

    const accessToken = await this.getAccessToken();
    const transId = uuidv4();
    const serviceCode = this.getServiceCode(shipmentData.Country);
    const stateProvinceCode = this.getStateCode(Receiver);
    const requestBody = this.buildRequestBody(shipmentData, stateProvinceCode, serviceCode, documentData.document_id);

    await DatabaseService.saveShipmentLog(
      "Shipment Request Payload",
      requestBody,
      { message: "Request payload prepared for UPS API." },
      100
    );

    const response = await this.sendShipmentRequest(requestBody, transId, accessToken);

    await DatabaseService.saveShipmentLog(
      "Shipment Response",
      requestBody,
      { status: response.statusCode, data: response.data },
      response.statusCode
    );

    return this.handleShipmentResponse(response, shipmentData, transId, serviceCode, documentRecordId);
  }

  async getAccessToken() {
    const accessToken = await OAuthService.getAccessToken();
    if (!accessToken) {
      await DatabaseService.saveShipmentLog(
        "Get Access Token - Failed",
        {},
        { error: "Kein gültiger Access Token verfügbar." },
        401
      );
      throw new Error('Kein gültiger Access Token verfügbar.');
    }
    return accessToken;
  }

  getServiceCode(country) {
    return country === 'DE' || country === 'NL' || country === "ES" || country === 'BE' ? '11' : '65';
  }

  getStateCode(receiver) {
    if (receiver.Country === 'US' && receiver.State) {
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

  buildAddress(person, countryCode, shipperNumber = null, stateProvinceCode = '') {
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
        StateProvinceCode: stateProvinceCode
      }
    };
  }

  async sendShipmentRequest(requestBody, transId, accessToken) {
    const response = await fetch(this.getShipmentUrl(), {
      method: 'POST',
      headers: this.getHeaders(transId, accessToken),
      body: JSON.stringify(requestBody)
    });
    const data = await response.json();

    await DatabaseService.saveShipmentLog(
      "UPS API Response",
      requestBody,
      { status: response.status, data },
      response.status
    );

    if (!response.ok) {
      return { statusCode: response.status, data };
    }
    return { data, statusCode: response.status };
  }

  async handleShipmentResponse(response, shipmentData, transId, serviceCode, documentRecordId) {
    const { data, statusCode } = response;

    if (!data.ShipmentResponse?.Response?.ResponseStatus?.Code === '1') {
      const errorResponse = { error: "Fehler beim Erstellen des Shipments", UPSResponse: response };
      await DatabaseService.saveShipmentLog(
        "Shipment Creation Failed",
        shipmentData,
        errorResponse,
        statusCode
      );
      return errorResponse;
    }

    const shipmentResults = data.ShipmentResponse?.ShipmentResults;
    const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;
    const packageResults = shipmentResults?.PackageResults;
    const zplBase64 = packageResults?.ShippingLabel?.GraphicImage;
    const internationalSignatureGraphicImage = packageResults?.ShippingLabel?.InternationalSignatureGraphicImage;
    const shipmentCharges = JSON.stringify(shipmentResults?.NegotiatedRateCharges);

    if (!zplBase64 || !trackingNumber) {
      const errorMessage = 'Fehler beim Erstellen des Shipments: Label oder Tracking-Nummer fehlt.';
      await DatabaseService.saveShipmentLog(
        "Shipment Creation - Missing Data",
        shipmentData,
        { error: errorMessage },
        500
      );
      throw new Error(errorMessage);
    }

    await DatabaseService.saveShipment({
      ID: uuidv4(),
      Referenz: shipmentData.OrderNr,
      ShipTo: JSON.stringify(shipmentData.Receiver),
      Service: JSON.stringify({ Code: serviceCode, Description: this.getServiceDescription(shipmentData.Country) }),
      Document_record_id: documentRecordId,
      StatusCode: statusCode,
      TransactionIdentifier: transId,
      ShipmentCharges: shipmentCharges,
      TrackingNr: trackingNumber,
      GraphicImage: zplBase64,
      InternationalSignatureGraphicImage: internationalSignatureGraphicImage,
      Benutzer: 'Test-User'
    });

    await DatabaseService.saveShipmentLog(
      "Shipment Saved to Database",
      shipmentData,
      { trackingNumber, message: "Shipment successfully saved to the database." },
      201
    );

    return {
      ZPLBase64: zplBase64,
      TrackingNumber: trackingNumber,
      DeliveryNoteNr: shipmentData.DeliveryNoteNr,
      Service: this.getServiceDescription(shipmentData.Country)
    };
  }

  getShipmentUrl() {
    return "https://onlinetools.ups.com/api/shipments/v1/ship?additionaladdressvalidation=string";
  }

  getHeaders(transId, accessToken) {
    return {
      'Content-Type': 'application/json',
      'transId': transId,
      'transactionSrc': 'testing',
      'Authorization': `Bearer ${accessToken}`
    };
  }

  debugLog(title, details) {
    console.log(`DEBUG: ${title}`);
    console.log(JSON.stringify(details, null, 2));
  }
}

export default new ShipmentController();
