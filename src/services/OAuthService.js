// src/services/OAuthService.js

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import TokenStorageService from './TokenStorageService.js';

dotenv.config();

class OAuthService {
  constructor() {
    this.baseUrl = process.env.BASE_URL;
    this.clientId = process.env.CLIENT_ID;
    this.clientSecret = process.env.CLIENT_SECRET;
    this.redirectUri = process.env.REDIRECT_URI;
  }

  // Erstellt den Authentifizierungslink
  generateAuthLink() {
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code'
    }).toString();

    return `${this.baseUrl}/security/v1/oauth/authorize?${query}`;
  }

  async generateToken(authCode) {
    const formData = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: this.redirectUri
    };

    try {
      const response = await fetch(`${this.baseUrl}/security/v1/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
        },
        body: new URLSearchParams(formData).toString()
      });

      if (!response.ok) {
        throw new Error(`Fehler: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      await TokenStorageService.saveToken(data);
      return data;
    } catch (error) {
      console.error('Fehler beim Token-Austausch:', error);
      throw error;
    }
  }

  async refreshToken() {
    const tokenData = await TokenStorageService.getLatestToken();

    if (tokenData && tokenData.refresh_token) {
      const formData = {
        grant_type: 'refresh_token',
        refresh_token: tokenData.refresh_token
      };

      try {
        const response = await fetch(`${this.baseUrl}/security/v1/oauth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization:
              'Basic ' +
              Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
          },
          body: new URLSearchParams(formData).toString()
        });

        if (!response.ok) {
          throw new Error(`Fehler: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        await TokenStorageService.saveToken(data);
        return data;
      } catch (error) {
        console.error('Fehler beim Auffrischen des Tokens:', error);
        throw error;
      }
    } else {
      console.log('Kein gültiger Refresh Token gefunden.');
      return null;
    }
  }

  // Methode, um den aktuellen Access Token zurückzugeben
  async getAccessToken() {
    const tokenData = await TokenStorageService.getLatestToken();

    if (tokenData) {
      if (await TokenStorageService.isTokenExpired(tokenData.expires_at)) {
        console.log('Token ist abgelaufen. Erneuerung erforderlich.');
        const newTokenData = await this.refreshToken();
        return newTokenData ? newTokenData.access_token : null;
      } else {
        console.log('Token ist gültig.');
        return tokenData.access_token;
      }
    } else {
      console.log('Kein Token gefunden, bitte login Sie sich hier ein.');
      console.log(this.generateAuthLink()); // Zeigt den Auth-Link an
      return null;
    }
  }
}

export default new OAuthService();
