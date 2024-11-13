// src/services/TokenStorageService.js

import DatabaseService from './DatabaseService.js';

class TokenStorageService {
  async saveToken(data) {
    const db = await DatabaseService.getDb();
    const expiresAt = Date.now() + data.expires_in * 1000;

    await db.query(
      `INSERT INTO tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)`,
      [data.access_token, data.refresh_token, expiresAt]
    );
    console.log('Access Token successfully saved in the database');
  }

  async getLatestToken() {
    return await DatabaseService.getLatestToken(); // Fetches the latest token through DatabaseService
  }

  async isTokenExpired(expiresAt) {
    return Date.now() > expiresAt;
  }
}

export default new TokenStorageService();
