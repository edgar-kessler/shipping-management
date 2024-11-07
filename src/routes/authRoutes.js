import express from 'express';
import { handleAuthCallback } from '../controllers/authController.js';

const router = express.Router();

router.get('/callback', handleAuthCallback);

export default router;
