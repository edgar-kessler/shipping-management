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

  // Helper method to generate the Authorization header
  createAuthHeader() {
    const authString = `${this.clientId}:${this.clientSecret}`;
    return 'Basic ' + Buffer.from(authString).toString('base64');
  }

  // Generates the authentication link
  generateAuthLink() {
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
    }).toString();

    return `https://onlinetools.ups.com/security/v1/oauth/authorize?${query}`;
  }

  async generateToken(authCode) {
    const formData = {
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: this.redirectUri,
    };

    try {
      const response = await fetch(`${this.baseUrl}/security/v1/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: this.createAuthHeader(),
        },
        body: new URLSearchParams(formData).toString(),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      await TokenStorageService.saveToken(data);
      return data;
    } catch (error) {
      console.error('Error during token exchange:', error);
      throw error;
    }
  }

  async refreshToken() {
    const tokenData = await TokenStorageService.getLatestToken();

    if (tokenData && tokenData.refresh_token) {
      const formData = {
        grant_type: 'refresh_token',
        refresh_token: tokenData.refresh_token,
      };

      try {
        const response = await fetch(`${this.baseUrl}/security/v1/oauth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: this.createAuthHeader(),
          },
          body: new URLSearchParams(formData).toString(),
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        await TokenStorageService.saveToken(data);
        return data;
      } catch (error) {
        console.error('Error refreshing the token:', error);
        throw error;
      }
    } else {
      console.info('No valid refresh token found.');
      return null;
    }
  }

  // Returns the current access token, refreshing if necessary
  async getAccessToken() {
    const tokenData = await TokenStorageService.getLatestToken();

    if (tokenData) {
      if (await TokenStorageService.isTokenExpired(tokenData.expires_at)) {
        console.info('Token expired. Refreshing required.');
        const newTokenData = await this.refreshToken();
        return newTokenData ? newTokenData.access_token : null;
      } else {
        console.info('Token is valid.');
        return tokenData.access_token;
      }
    } else {
      console.info('No token found. Please log in using the link below:');
      console.info(this.generateAuthLink());
      return null;
    }
  }
}

export default new OAuthService();
