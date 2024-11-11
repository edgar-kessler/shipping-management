// src/controllers/ShipmentController.js

import fetch from 'node-fetch';
import OAuthService from '../services/OAuthService.js';
import DatabaseService from '../services/DatabaseService.js';
import { v4 as uuidv4 } from 'uuid';

class ShipmentController {
  async createShipment(shipmentData) {
    const {
      OrderNr,
      DeliveryNoteNr,
      ReferenceNumber,
      Receiver,
      Sender,
      documentId,
      ServiceCode = shipmentData.Country === 'DE' || shipmentData.Country === 'NL' || shipmentData.Country === 'BE' ? '11' : '65'
    } = shipmentData;

    const accessToken = await OAuthService.getAccessToken();
    if (!accessToken) {
      const errorMessage = 'Kein gültiger Access Token verfügbar.';
      await DatabaseService.saveShipmentLog({
        orderNr: OrderNr,
        statusCode: 500,
        message: errorMessage
      });
      throw new Error(errorMessage);
    }

    const transId = uuidv4();
    const url = `https://wwwcie.ups.com/api/shipments/v1/ship?additionaladdressvalidation=string`;

    const stateProvinceCode = Receiver.Country === 'US' ? 'GA' : undefined;

    const requestBody = {
      ShipmentRequest: {
        Request: {
          SubVersion: "1801",
          RequestOption: 'nonvalidate',
          TransactionReference: {
            CustomerContext: ReferenceNumber
          }
        },
        Shipment: {
          Description: 'Goalkeeper Goods',
          Shipper: {
            Name: Sender.Company,
            AttentionName: Sender.Name,
            ShipperNumber: process.env.SHIPPERNUMBER || 'G224H8',
            TaxIdentificationNumber: 'DE332654187',
            Phone: { Number: Sender.Phone || '0000', Extension: ' ' },
            Address: {
              AddressLine: Sender.AddressLine1,
              City: Sender.City,
              PostalCode: Sender.PostCode,
              CountryCode: 'NL'
            }
          },
          ShipTo: {
            Name: Receiver.Name,
            AttentionName: Receiver.Name,
            Phone: { Number: Receiver.Phone },
            EMailAddress: Receiver.Email,
            Address: {
              AddressLine: [
                Receiver.AddressLine1,
                Receiver.AddressLine2 || '',
                Receiver.AddressLine3 || ''
              ],
              City: Receiver.City,
              PostalCode: Receiver.PostalCode,
              CountryCode: Receiver.Country,
              StateProvinceCode: stateProvinceCode
            }
          },
          ShipFrom: {
            Name: Sender.Company,
            AttentionName: Sender.Name,
            Phone: { Number: Sender.Phone },
            Address: {
              AddressLine: Sender.AddressLine1,
              City: Sender.City,
              PostalCode: Sender.PostCode,
              CountryCode: 'NL'
            }
          },
          PaymentInformation: {
            ShipmentCharge: {
              Type: '01',
              BillShipper: {
                AccountNumber: process.env.SHIPPERNUMBER || 'G224H8'
              }
            }
          },
          Service: {
            Code: ServiceCode,
            Description: shipmentData.Country === 'DE' || shipmentData.Country === 'NL' || shipmentData.Country === 'BE' ? 'UPS Standard' : 'UPS Saver'
          },
          Package: {
            Description: 'Goalkeeper Goods',
            Packaging: { Code: '02', Description: 'Box' },
            Dimensions: {
              UnitOfMeasurement: { Code: 'CM', Description: 'Centimeters' },
              Length: '10',
              Width: '10',
              Height: '10'
            },
            PackageWeight: {
              UnitOfMeasurement: { Code: 'KGS', Description: 'Kilograms' },
              Weight: '1'
            }
          },
          ShipmentServiceOptions: {
            InternationalForms: {
              FormType: ['07'],
              UserCreatedForm: [
                {
                  DocumentID: [documentId]
                }
              ]
            }
          }
        },
        LabelSpecification: {
          LabelImageFormat: {
            Code: 'ZPL',
            Description: 'ZPL'
          },
          LabelStockSize: {
            Height: '6',
            Width: '4'
          }
        }
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'transId': transId,
          'transactionSrc': 'testing',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      const statusCode = response.status;

      if (!response.ok || data.ShipmentResponse?.Response?.ResponseStatus?.Code !== '1') {
        const errorMessage = data.ShipmentResponse?.Response?.Alert?.map(alert => alert.Description).join('; ') || 'Unbekannter Fehler';

        // Speichere Fehler in den shipment_logs und shipments Tabellen
        await DatabaseService.saveShipmentLog({
          orderNr: OrderNr,
          statusCode,
          message: errorMessage
        });

        await DatabaseService.saveShipment({
          orderNr: OrderNr,
          deliveryNoteNr: DeliveryNoteNr,
          trackingNumber: null,
          service: ServiceCode,
          labelZPLBase64: null,
          shipmentCharges: null,
          documentRecordId: documentId,
          transactionIdentifier: transId,
          errorMessage,
          statusCode
        });

        throw new Error(`Fehler bei der Shipment-Anfrage: ${errorMessage}`);
      }

      const shipmentResults = data.ShipmentResponse?.ShipmentResults;
      const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;
      const packageResults = shipmentResults?.PackageResults;
      const zplBase64 = packageResults?.ShippingLabel?.GraphicImage;
      const shipmentCharges = JSON.stringify(shipmentResults?.ShipmentCharges);

      if (!zplBase64 || !trackingNumber) {
        throw new Error('Fehler beim Erstellen des Shipments: Label oder Tracking-Nummer fehlt.');
      }

      // Speichere erfolgreiches Shipment in der Datenbank
      await DatabaseService.saveShipment({
        orderNr: OrderNr,
        deliveryNoteNr: DeliveryNoteNr,
        trackingNumber,
        service: ServiceCode,
        labelZPLBase64: zplBase64,
        shipmentCharges,
        documentRecordId: documentId,
        transactionIdentifier: transId,
        errorMessage: null,
        statusCode: 200
      });

      // Speichere Erfolgsmeldung in den Logs
      await DatabaseService.saveShipmentLog({
        orderNr: OrderNr,
        statusCode: 200,
        message: 'Shipment erfolgreich erstellt.'
      });

      return {
        ZPLBase64: zplBase64,
        TrackingNumber: trackingNumber,
        DeliveryNoteNr,
        Service: shipmentData.Country === 'DE' || shipmentData.Country === 'NL' || shipmentData.Country === 'BE' ? 'UPS Standard' : 'UPS Saver'
      };

    } catch (error) {
      console.error('Fehler beim Erstellen des Shipments:', error.message);

      await DatabaseService.saveShipmentLog({
        orderNr: OrderNr,
        statusCode: 500,
        message: error.message
      });

      throw error;
    }
  }
}

export default new ShipmentController();
