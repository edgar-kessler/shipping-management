import express from 'express';
import UploadDocumentService from '../services/UploadDocumentService.js';

const router = express.Router();

// POST /upload_document - Endpunkt zum Hochladen eines Dokuments
router.post('/upload_document', async (req, res) => {
  const { base64File, fileName } = req.body;

  if (!base64File || !fileName) {
    return res.status(400).json({ error: 'Base64-String und Dateiname sind erforderlich.' });
  }

  try {
    const recordId = await UploadDocumentService.uploadDocument(base64File, fileName);
    res.json({ recordId });
  } catch (error) {
    console.error('Fehler beim Hochladen des Dokuments:', error);
    res.status(500).json({ error: 'Fehler beim Hochladen des Dokuments.' });
  }
});

export default router;
