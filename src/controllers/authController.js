// src/controllers/authController.js
import OAuthService from '../services/OAuthService.js';


export async function handleAuthCallback(req, res) {
  const authCode = req.query.code;
  
  if (authCode) {
    try {
      // Stelle sicher, dass handleAuthCallback async ist
      const tokenData = await OAuthService.generateToken(authCode);
      res.send(`Access Token erhalten: ${tokenData.access_token}`);
    } catch (error) {
      res.status(500).send('Fehler bei der Token-Generierung');
    }
  } else {
    res.status(400).send('Authorization Code fehlt.');
  }
}
