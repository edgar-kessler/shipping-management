import DatabaseService from './DatabaseService.js';

class TokenStorageService {
  async saveToken(data) {
    const db = await DatabaseService.getDb();
    const expiresAt = Date.now() + data.expires_in * 1000;

    await db.run(
      `INSERT INTO tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)`,
      data.access_token,
      data.refresh_token,
      expiresAt
    );
    console.log('Access Token erfolgreich in der Datenbank gespeichert');
  }

  async getLatestToken() {
    const db = await DatabaseService.getDb();
    return db.get(`SELECT access_token, refresh_token, expires_at FROM tokens ORDER BY id DESC LIMIT 1`);
  }

  async isTokenExpired(expiresAt) {
    return Date.now() > expiresAt;
  }
}

export default new TokenStorageService();
