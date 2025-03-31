// src/services/AIService.js

import fetch from 'node-fetch';
import DatabaseService from './DatabaseService.js';

class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
    this.model = 'gemini-pro'; // Default model
    
    if (!this.apiKey) {
      console.error('Gemini API key not configured in .env');
    } else {
      console.debug('Gemini API key detected');
    }
    
    // Standard service codes by country
    this.standardServicesByCountry = {
      'DE': '11', // UPS Standard for Germany
      'NL': '11', // UPS Standard for Netherlands
      'BE': '11', // UPS Standard for Belgium
      'default': '65' // UPS Express Saver for other countries
    };
  }

  /**
   * Get AI recommendation for the best shipping service
   * @param {Array} serviceOptions - Available service options with rates
   * @param {Object} shipmentData - Shipment data including origin, destination
   * @returns {Promise<Object>} - Recommended service with explanation
   */
  async getServiceRecommendation(serviceOptions, shipmentData) {
    try {
      if (!serviceOptions || serviceOptions.length === 0) {
        throw new Error('No service options available');
      }
      
      // Get the standard service code for this country
      const countryCode = shipmentData.Receiver.Country;
      const standardServiceCode = this.standardServicesByCountry[countryCode] || this.standardServicesByCountry.default;
      
      // Find the standard service in the options
      const standardService = serviceOptions.find(service => service.serviceCode === standardServiceCode);
      
      if (!standardService) {
        console.warn(`Standard service (${standardServiceCode}) not found in options. Using fallback.`);
        return this.fallbackServiceSelection(serviceOptions, countryCode);
      }
      
      // Find cheaper alternatives with acceptable delivery times
      const costSavingOptions = this.findCostSavingOptions(serviceOptions, standardService);
      
      // If we have cost-saving options, use AI to evaluate them if API key is available
      if (costSavingOptions.length > 0 && this.apiKey) {
        return await this.getAIRecommendation(costSavingOptions, standardService, shipmentData);
      } else if (costSavingOptions.length > 0) {
        // If no API key, use our own logic
        return this.selectBestCostSavingOption(costSavingOptions, standardService, shipmentData);
      } else {
        // No cost-saving options found, use standard service
        return {
          recommendedService: standardService,
          reason: 'Using standard service as no cost-saving alternatives were found.',
          allOptions: serviceOptions,
          costSaving: {
            amount: 0,
            currency: standardService.charge.currency,
            percentage: 0
          },
          standardService
        };
      }
    } catch (error) {
      console.error('Error in service recommendation:', error);
      return this.fallbackServiceSelection(serviceOptions, shipmentData.Receiver.Country);
    }
  }

  /**
   * Find service options that could save money compared to standard service
   * @param {Array} serviceOptions - All available service options
   * @param {Object} standardService - The standard service for this country
   * @returns {Array} - List of cost-saving options
   */
  findCostSavingOptions(serviceOptions, standardService) {
    if (!standardService) return [];
    
    const standardCost = parseFloat(standardService.charge.amount);
    const standardTransitDays = parseInt(standardService.transitDays) || 999;
    
    // Find options that are cheaper and have acceptable delivery times
    return serviceOptions.filter(option => {
      const cost = parseFloat(option.charge.amount);
      const transitDays = parseInt(option.transitDays) || 999;
      
      // Must be cheaper than standard service
      if (cost >= standardCost) return false;
      
      // Must not be more than 1 day slower than standard service
      if (transitDays > standardTransitDays + 1) return false;
      
      return true;
    });
  }

  /**
   * Select the best cost-saving option using our own logic
   * @param {Array} costSavingOptions - List of cost-saving options
   * @param {Object} standardService - The standard service
   * @param {Object} shipmentData - Shipment data
   * @returns {Object} - Selected service with explanation
   */
  selectBestCostSavingOption(costSavingOptions, standardService, shipmentData) {
    console.debug('MANUUELLL', JSON.stringify(costSavingOptions, null, 2));
    // Sort by cost (cheapest first)
    costSavingOptions.sort((a, b) => 
      parseFloat(a.charge.amount) - parseFloat(b.charge.amount)
    );
    
    // Get the cheapest option
    const cheapestOption = costSavingOptions[0];
    
    // Calculate cost savings
    const standardCost = parseFloat(standardService.charge.amount);
    const cheapestCost = parseFloat(cheapestOption.charge.amount);
    const savingsAmount = standardCost - cheapestCost;
    const savingsPercentage = (savingsAmount / standardCost) * 100;
    
    // Format the savings for display
    const formattedSavings = savingsAmount.toFixed(2);
    const formattedPercentage = savingsPercentage.toFixed(1);
    
    // Log the savings
    this.logCostSavings({
      countryCode: shipmentData.Receiver.Country,
      standardService,
      selectedService: cheapestOption,
      savings: {
        amount: savingsAmount,
        currency: standardService.charge.currency,
        percentage: savingsPercentage
      },
      shipmentData
    });
    
    return {
      recommendedService: cheapestOption,
      reason: `Selected ${cheapestOption.serviceName} to save ${formattedSavings} ${cheapestOption.charge.currency} (${formattedPercentage}%) compared to standard service (${standardService.serviceName}).`,
      allOptions: costSavingOptions,
      costSaving: {
        amount: savingsAmount,
        currency: standardService.charge.currency,
        percentage: savingsPercentage
      },
      standardService
    };
  }

  /**
   * Get AI recommendation for the best cost-saving option
   * @param {Array} costSavingOptions - List of cost-saving options
   * @param {Object} standardService - The standard service
   * @param {Object} shipmentData - Shipment data
   * @returns {Object} - AI recommended service
   */
  async getAIRecommendation(costSavingOptions, standardService, shipmentData) {
    try {
      // Validate API key format
      if (!this.apiKey || !this.apiKey.startsWith('sk-or-v1-')) {
        console.warn('Invalid or missing OpenRouter API key format');
        throw new Error('AI service unavailable');
      }

      // Prepare context for the AI
      const context = this.prepareContext(costSavingOptions, standardService, shipmentData);
      
      const requestBody = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a shipping logistics expert focused on cost savings. Your task is to recommend the most cost-effective UPS shipping service that does not compromise delivery time significantly. The goal is to save money while ensuring delivery is not delayed by more than 1 day compared to the standard service. Consider factors like cost, delivery time, reliability, and specific shipment requirements. Provide your recommendation with a brief explanation.'
          },
          {
            role: 'user',
            content: context
          }
        ],
        temperature: 0.2,
        max_tokens: 10000
      };

      console.debug('Request body:', JSON.stringify(requestBody));

      console.debug('Sending AI recommendation request:', {
        model: this.model,
        contextLength: context.length,
        optionsCount: costSavingOptions.length
      });

      console.debug('Using API key prefix:', this.apiKey?.slice(0, 8) + '...');
      
      // Make request to Gemini API
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: requestBody.messages,
          generationConfig: {
            temperature: requestBody.temperature,
            maxOutputTokens: requestBody.max_tokens
          }
        })
      });
      console.log('Response------------AI:', JSON.stringify(response));

      const responseText = await response.text();
      if (!response.ok) {
        console.error('OpenRouter API error:', {
          status: response.status,
          response: responseText,
          request: requestBody
        });
        throw new Error(`AI service error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.debug('Gemini API successful response:', {
        model: this.model,
        usage: data.usageMetadata,
        responseLength: data.candidates?.[0]?.content?.parts?.[0]?.text?.length
      });
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response format from Gemini API');
      }
      
      const aiResponse = data.candidates[0].content.parts[0].text;
      
      // Parse AI response to extract recommendation
      return this.parseAIResponse(aiResponse, costSavingOptions, standardService, shipmentData);
    } catch (error) {
      console.error('Error getting AI recommendation:', error);
      // Fall back to our own logic if AI fails
      return this.selectBestCostSavingOption(costSavingOptions, standardService, shipmentData);
    }
  }

  /**
   * Prepare context for the AI model
   * @param {Array} costSavingOptions - Cost-saving service options
   * @param {Object} standardService - The standard service
   * @param {Object} shipmentData - Shipment data
   * @returns {string} - Formatted context
   */
  prepareContext(costSavingOptions, standardService, shipmentData) {
    // Format standard service
    const standardServiceInfo = `
Standard Service: ${standardService.serviceName}
- Cost: ${standardService.charge.amount} ${standardService.charge.currency}
- Delivery time: ${standardService.transitDays} business days
- Guaranteed delivery: ${standardService.guaranteed ? 'Yes' : 'No'}
- Zone: ${standardService.zone}`;

    // Format cost-saving options
    const formattedOptions = costSavingOptions.map((option, index) => {
      const costDifference = (parseFloat(standardService.charge.amount) - parseFloat(option.charge.amount)).toFixed(2);
      const percentageSaving = ((parseFloat(costDifference) / parseFloat(standardService.charge.amount)) * 100).toFixed(1);
      
      return `Option ${index + 1}: ${option.serviceName}
- Cost: ${option.charge.amount} ${option.charge.currency} (saves ${costDifference} ${option.charge.currency}, ${percentageSaving}%)
- Delivery time: ${option.transitDays} business days
- Guaranteed delivery: ${option.guaranteed ? 'Yes' : 'No'}
- Zone: ${option.zone}`;
    }).join('\n\n');

    // Format shipment details
    const shipmentDetails = `
Shipment Details:
- From: ${shipmentData.Sender.City}, ${shipmentData.Sender.Country || 'NL'}
- To: ${shipmentData.Receiver.City}, ${shipmentData.Receiver.Country}
- Package weight: ${standardService.weight || '1'} kg
- Reference: ${shipmentData.OrderNr || 'N/A'}
`;

    return `I need to select the most cost-effective UPS shipping service for a package. The standard service we normally use is:

${standardServiceInfo}

Here are cheaper alternatives:

${formattedOptions}

${shipmentDetails}

Please recommend the best cost-saving option. The goal is to save money while ensuring delivery is not delayed by more than 1 day compared to the standard service. Return your response in this format:
RECOMMENDED_SERVICE: [service name]
REASON: [brief explanation]
SAVINGS: [amount] [currency] ([percentage]%)`;
  }

  /**
   * Parse AI response to extract recommendation
   * @param {string} aiResponse - Raw AI response
   * @param {Array} costSavingOptions - Available cost-saving options
   * @param {Object} standardService - The standard service
   * @param {Object} shipmentData - Shipment data
   * @returns {Object} - Recommended service with explanation
   */
  parseAIResponse(aiResponse, costSavingOptions, standardService, shipmentData) {
    try {
      // Extract recommended service, reason and savings
      const recommendedServiceMatch = aiResponse.match(/RECOMMENDED_SERVICE:\s*(.+?)(?:\n|$)/i);
      const reasonMatch = aiResponse.match(/REASON:\s*(.+?)(?:\n|$)/i);
      const savingsMatch = aiResponse.match(/SAVINGS:\s*(.+?)(?:\n|$)/i);
      
      // If we couldn't parse the structured format, try to extract service name from the text
      let recommendedServiceName;
      if (recommendedServiceMatch) {
        recommendedServiceName = recommendedServiceMatch[1].trim();
      } else {
        // Look for service names in the response
        for (const option of costSavingOptions) {
          if (aiResponse.includes(option.serviceName)) {
            recommendedServiceName = option.serviceName;
            break;
          }
        }
        
        // If still no match, use the first option
        if (!recommendedServiceName && costSavingOptions.length > 0) {
          recommendedServiceName = costSavingOptions[0].serviceName;
        }
      }
      
      const reason = reasonMatch ? 
        reasonMatch[1].trim() : 
        'Based on cost-benefit analysis of available options.';
      
      const savingsText = savingsMatch ? 
        savingsMatch[1].trim() : 
        null;
      
      // Find the service option that matches the recommendation
      let recommendedService = null;
      
      if (recommendedServiceName) {
        // Try exact match first
        recommendedService = costSavingOptions.find(option => 
          option.serviceName === recommendedServiceName
        );
        
        // If no exact match, try partial match
        if (!recommendedService) {
          recommendedService = costSavingOptions.find(option => 
            option.serviceName.toLowerCase().includes(recommendedServiceName.toLowerCase()) ||
            recommendedServiceName.toLowerCase().includes(option.serviceName.toLowerCase())
          );
        }
      }
      
      // If no match found, use the cheapest option
      if (!recommendedService && costSavingOptions.length > 0) {
        recommendedService = costSavingOptions.sort((a, b) => 
          parseFloat(a.charge.amount) - parseFloat(b.charge.amount)
        )[0];
      }
      
      // If still no recommended service, fall back to standard
      if (!recommendedService) {
        return {
          recommendedService: standardService,
          reason: 'Using standard service as no suitable alternative was found.',
          allOptions: costSavingOptions,
          costSaving: {
            amount: 0,
            currency: standardService.charge.currency,
            percentage: 0
          },
          standardService
        };
      }
      
      // Calculate cost savings
      const standardCost = parseFloat(standardService.charge.amount);
      const recommendedCost = parseFloat(recommendedService.charge.amount);
      const savingsAmount = standardCost - recommendedCost;
      const savingsPercentage = (savingsAmount / standardCost) * 100;
      
      // Log the savings
      this.logCostSavings({
        countryCode: shipmentData.Receiver.Country,
        standardService,
        selectedService: recommendedService,
        savings: {
          amount: savingsAmount,
          currency: standardService.charge.currency,
          percentage: savingsPercentage
        },
        shipmentData,
        aiRecommended: true
      });
      
      return {
        recommendedService,
        reason,
        allOptions: costSavingOptions,
        costSaving: {
          amount: savingsAmount,
          currency: standardService.charge.currency,
          percentage: savingsPercentage,
          text: savingsText
        },
        standardService
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.selectBestCostSavingOption(costSavingOptions, standardService, shipmentData);
    }
  }

  /**
   * Fallback logic for service selection when AI is unavailable
   * @param {Array} serviceOptions - Available service options
   * @param {string} countryCode - Destination country code
   * @returns {Object} - Selected service with explanation
   */
  fallbackServiceSelection(serviceOptions, countryCode) {
    if (!serviceOptions || serviceOptions.length === 0) {
      throw new Error('No service options available');
    }
    
    // Get the standard service code for this country
    const standardServiceCode = this.standardServicesByCountry[countryCode] || this.standardServicesByCountry.default;
    
    // Find the standard service in the options
    const standardService = serviceOptions.find(service => service.serviceCode === standardServiceCode);
    
    if (standardService) {
      return {
        recommendedService: standardService,
        reason: 'Using standard service as fallback.',
        allOptions: serviceOptions,
        costSaving: {
          amount: 0,
          currency: standardService.charge.currency,
          percentage: 0
        },
        standardService
      };
    }
    
    // If standard service not found, use the cheapest option
    const cheapestOption = serviceOptions.sort((a, b) => 
      parseFloat(a.charge.amount) - parseFloat(b.charge.amount)
    )[0];
    
    return {
      recommendedService: cheapestOption,
      reason: 'Using cheapest service as standard service not found.',
      allOptions: serviceOptions,
      costSaving: {
        amount: 0,
        currency: cheapestOption.charge.currency,
        percentage: 0
      }
    };
  }

  /**
   * Log cost savings to the database for analysis
   * @param {Object} data - Cost savings data
   */
  /**
   * Translate and summarize an error message in German
   * @param {Error|string} error - The error to translate
   * @param {Object} [context] - Additional context about the error
   * @returns {Promise<string>} - Translated and summarized error in German
   */
  async translateError(error, context = {}) {
    try {
      const errorMessage = typeof error === 'string' ? error : error.message;
      const errorStack = typeof error === 'string' ? '' : error.stack;
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://shipping-management-app.com'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'Du bist ein technischer Übersetzer. Übersetze die Fehlermeldung ins Deutsche und fasse sie kurz zusammen. Halte es technisch präzise aber verständlich. Format: "Zusammenfassung: [kurze Ursache] Lösung: [empfohlene Aktion]"'
            },
            {
              role: 'user',
              content: `Original error: ${errorMessage}\n\nStack: ${errorStack}\n\nContext: ${JSON.stringify(context)}`
            }
          ],
          temperature: 0.1, // Low temperature for accurate translations
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', errorText);
        return `Fehlerübersetzung fehlgeschlagen. Original: ${errorMessage}`;
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || `Übersetzungsfehler. Original: ${errorMessage}`;
    } catch (err) {
      console.error('Error in translateError:', err);
      return `Fehler bei der Übersetzung. Original: ${typeof error === 'string' ? error : error.message}`;
    }
  }

  async logCostSavings(data) {
    try {
      const db = await DatabaseService.getDb();
      const timestamp = new Date().toISOString();
      
      // Parse transit days to integers
      const standardTransitDays = parseInt(data.standardService.transitDays) || 0;
      const selectedTransitDays = parseInt(data.selectedService.transitDays) || 0;
      const transitDaysDifference = selectedTransitDays - standardTransitDays;
      
      const logData = {
        countryCode: data.countryCode,
        standardService: {
          code: data.standardService.serviceCode,
          name: data.standardService.serviceName,
          cost: parseFloat(data.standardService.charge.amount),
          currency: data.standardService.charge.currency,
          transitDays: standardTransitDays
        },
        selectedService: {
          code: data.selectedService.serviceCode,
          name: data.selectedService.serviceName,
          cost: parseFloat(data.selectedService.charge.amount),
          currency: data.selectedService.charge.currency,
          transitDays: selectedTransitDays
        },
        transitDaysDifference: transitDaysDifference,
        savings: {
          amount: data.savings.amount,
          percentage: data.savings.percentage,
          currency: data.savings.currency
        },
        shipmentDetails: {
          from: data.shipmentData.Sender.City,
          to: data.shipmentData.Receiver.City,
          country: data.countryCode,
          reference: data.shipmentData.OrderNr || 'N/A'
        },
        aiRecommended: data.aiRecommended || false,
        timestamp
      };
      
      await db.execute(
        `INSERT INTO cost_savings (
          country_code,
          standard_service_code,
          standard_service_name,
          standard_service_cost,
          standard_transit_days,
          selected_service_code,
          selected_service_name,
          selected_service_cost,
          selected_transit_days,
          transit_days_difference,
          savings_amount,
          savings_percentage,
          currency,
          shipment_reference,
          ai_recommended,
          timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          country_code = VALUES(country_code),
          standard_service_code = VALUES(standard_service_code),
          standard_service_name = VALUES(standard_service_name),
          standard_service_cost = VALUES(standard_service_cost),
          standard_transit_days = VALUES(standard_transit_days),
          selected_service_code = VALUES(selected_service_code),
          selected_service_name = VALUES(selected_service_name),
          selected_service_cost = VALUES(selected_service_cost),
          selected_transit_days = VALUES(selected_transit_days),
          transit_days_difference = VALUES(transit_days_difference),
          savings_amount = VALUES(savings_amount),
          savings_percentage = VALUES(savings_percentage),
          currency = VALUES(currency),
          ai_recommended = VALUES(ai_recommended),
          timestamp = VALUES(timestamp)`,
        [
          logData.countryCode,
          logData.standardService.code,
          logData.standardService.name,
          logData.standardService.cost,
          logData.standardService.transitDays,
          logData.selectedService.code,
          logData.selectedService.name,
          logData.selectedService.cost,
          logData.selectedService.transitDays,
          logData.transitDaysDifference,
          logData.savings.amount,
          logData.savings.percentage,
          logData.savings.currency,
          logData.shipmentDetails.reference,
          logData.aiRecommended ? 1 : 0,
          timestamp
        ]
      );
      
      const delayInfo = logData.transitDaysDifference > 0 
        ? ` with ${logData.transitDaysDifference} day(s) longer delivery time` 
        : logData.transitDaysDifference < 0
          ? ` with ${Math.abs(logData.transitDaysDifference)} day(s) faster delivery time`
          : ` with no change in delivery time`;
          
      console.log(`Cost savings logged: ${logData.savings.amount} ${logData.savings.currency} (${logData.savings.percentage.toFixed(1)}%)${delayInfo}`);
    } catch (error) {
      console.error('Error logging cost savings:', {
        error: error.message,
        code: error.code,
        table: 'cost_savings',
        sql: error.sql
      });
      
      // Check if it's a missing column error
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        console.error('Database schema may need updating - missing columns detected');
      }
      // Don't throw error to ensure the API still returns the response
    }
  }
}

export default new AIService();
