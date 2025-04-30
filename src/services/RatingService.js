// src/services/RatingService.js

import fetch from 'node-fetch';
import OAuthService from './OAuthService.js';
import DatabaseService from './DatabaseService.js';
import { getStateCodeByStateName } from 'us-state-codes';

class RatingService {
  constructor() {
    this.baseUrl = 'https://onlinetools.ups.com';
    this.version = 'v2409';
    this.shipperNumber = process.env.SHIPPER_NUMBER || 'G224H8';
  }

  /**
   * Get rate estimates for a shipment
   * @param {Object} shipmentData - Shipment data including origin, destination, and package details
   * @returns {Promise<Array>} - Array of service options with rates
   */
  async getRates(shipmentData) {
    try {
      const accessToken = await OAuthService.getAccessToken();
      if (!accessToken) {
        throw new Error('No valid Access Token available.');
      }

      const transId = this.generateTransactionId();
      const url = `${this.baseUrl}/api/rating/${this.version}/Shoptimeintransit`;

      const { Receiver, Sender } = shipmentData;

      // Build the request body for rating
      const body = {
        RateRequest: {
          Request: {
            TransactionReference: {
              CustomerContext: transId
            }
          },
          Pickuptype: {
            Code: "01",
            Description: "Daily"
          },
          CustomerClassification: {
            Code: "02",
            Description: "Rates Associated with Shipper Number"
          },
          Shipment: {
            Shipper: this.formatAddress(Sender, 'NL', this.shipperNumber),
            ShipTo: this.formatAddress(Receiver, Receiver.Country),
            ShipFrom: this.formatAddress(Sender, 'NL'),
            PaymentDetails: {
              ShipmentCharge: [
                {
                  Type: "01",
                  BillShipper: {
                    AccountNumber: this.shipperNumber
                  }
                }
              ]
            },
            ShipmentTotalWeight: {
              UnitOfMeasurement: {
                Code: "KGS",
                Description: "Kilograms"
              },
              Weight: "1"
            },
            Package: [
              {
                PackagingType: {
                  Code: "02",
                  Description: "Package"
                },
                Dimensions: {
                  UnitOfMeasurement: {
                    Code: "CM",
                    Description: "Centimeters"
                  },
                  Length: "10",
                  Width: "10",
                  Height: "10"
                },
                PackageWeight: {
                  UnitOfMeasurement: {
                    Code: "KGS",
                    Description: "Kilograms"
                  },
                  Weight: "1"
                }
              }
            ],
            InvoiceLineTotal: {
              CurrencyCode: "EUR",
              MonetaryValue: "10.00"
            },
            ShipmentRatingOptions: {
              NegotiatedRatesIndicator: "Y"
            },
            DeliveryTimeInformation: {
              PackageBillType: "03",
              Pickup: {
                Date: new Date().toISOString().split('T')[0],
                Time: new Date().toTimeString().split(' ')[0].substring(0, 5)
              }
            }
          }
        }
      };

      // Make the request to UPS API
      console.log("BODY--------------", JSON.stringify(body))
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'transId': transId,
          'transactionSrc': 'rating',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
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
        error.upsError = JSON.stringify(upsError);
        
        // Log the error for debugging
        console.error('UPS API Error:', {
          status: response.status,
          statusText: response.statusText,
          details: upsError
        });
        
        throw JSON.stringify(upsError);
      }

      const data = await response.json();
      
      // Process and simplify the response
      const serviceOptions = this.processRatingResponse(data);
      
      // Save the rating to database
      await this.saveRatingToDatabase(shipmentData, serviceOptions, transId);
      
      return serviceOptions;
    } catch (error) {
      console.error('Error getting rates:', error);
      throw error;
    }
  }

  /**
   * Process the UPS rating response to extract service options
   * @param {Object} response - UPS API response
   * @returns {Array} - Simplified array of service options
   */
  processRatingResponse(response) {
    if (!response.RateResponse || !response.RateResponse.RatedShipment) {
      return [];
    }

    // Map service codes to names
    const serviceNames = {
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

    // Extract and simplify each service option
    return response.RateResponse.RatedShipment.map(ratedShipment => {
      const serviceCode = ratedShipment.Service.Code;
      const serviceName = serviceNames[serviceCode] || `UPS Service (${serviceCode})`;
      
      // Get negotiated rates if available
      const charge = ratedShipment.NegotiatedRateCharges?.TotalCharge || ratedShipment.TotalCharges;
      
      // Get transit time if available
      const transitDays = ratedShipment.TimeInTransit?.ServiceSummary?.EstimatedArrival?.BusinessDaysInTransit || 'Unknown';
      
      // Get guaranteed indicator if available
      const guaranteed = ratedShipment.TimeInTransit?.ServiceSummary?.GuaranteedIndicator || false;
      
      return {
        serviceCode,
        serviceName,
        charge: {
          amount: charge.MonetaryValue,
          currency: charge.CurrencyCode
        },
        transitDays,
        guaranteed,
        weight: ratedShipment.BillingWeight?.Weight || '1',
        zone: ratedShipment.Zone || 'Unknown'
      };
    }).sort((a, b) => parseFloat(a.charge.amount) - parseFloat(b.charge.amount));
  }

  /**
   * Save rating data to database
   * @param {Object} shipmentData - Original shipment data
   * @param {Array} serviceOptions - Processed service options
   * @param {string} transId - Transaction ID
   */
  async saveRatingToDatabase(shipmentData, serviceOptions, transId) {
    try {
      const db = await DatabaseService.getDb();
      const timestamp = new Date().toISOString();
      
      // Save the rating data as JSON
      const ratingData = {
        shipmentData,
        serviceOptions,
        timestamp
      };
      
      await db.execute(
        `INSERT INTO ratings (transaction_id, rating_data, timestamp)
         VALUES (?, ?, ?)`,
        [transId, JSON.stringify(ratingData), timestamp]
      );
      
      console.log('Rating data saved to database');
    } catch (error) {
      console.error('Error saving rating to database:', error);
      // Don't throw error to ensure the API still returns the response
    }
  }

  /**
   * Format address for UPS API
   * @param {Object} person - Address information
   * @param {string} countryCode - Country code
   * @param {string} shipperNumber - Optional shipper number
   * @returns {Object} - Formatted address
   */
  formatAddress(person, countryCode, shipperNumber = null) {
    const address = {
      Name: person.Company || person.Name,
      AttentionName: person.Name,
      Phone: { Number: person.Phone || '0000' },
      Address: {
        AddressLine: [person.AddressLine1, person.AddressLine2 || '', person.AddressLine3 || ''].filter(Boolean),
        City: person.City,
        PostalCode: person.PostalCode,
        CountryCode: countryCode
      }
    };
    
    // Add shipper number if provided
    if (shipperNumber) {
      address.ShipperNumber = shipperNumber;
    }
    
    // Add email if available
    if (person.Email) {
      address.Email = { EmailAddress: person.Email };
    }
    
    // Add state/province code if available
    if (person.State) {
      if (countryCode === 'US') {
        try {
          const stateCode = getStateCodeByStateName(person.State);
          if (stateCode) {
            address.Address.StateProvinceCode = stateCode;
          } else {
            console.warn(`Unknown or invalid US state: ${person.State}`);
            address.Address.StateProvinceCode = '';
          }
        } catch (error) {
          console.error(`State code conversion error: ${error.message}`);
          address.Address.StateProvinceCode = '';
        }
      } else {
        address.Address.StateProvinceCode = person.State;
      }
    }
    
    return address;
  }

  /**
   * Generate a unique transaction ID
   * @returns {string} - Random transaction ID
   */
  generateTransactionId() {
    return Math.random().toString(36).substring(2, 34).padEnd(32, '0');
  }
}

export default new RatingService();
