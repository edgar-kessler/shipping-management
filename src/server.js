import express from 'express';
import dotenv from 'dotenv';
import OAuthService from './services/OAuthService.js';
import authRoutes from './routes/authRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
import DatabaseService from './services/DatabaseService.js';
import uploadRoutes from './routes/uploadRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/documents', uploadRoutes);

async function main() {
    try {
        // Ensure tables are initialized
        await DatabaseService.initializeDatabase();
    
        // ... other application startup code
      } catch (error) {
        console.error('Error initializing the database:', error);
      }
    await OAuthService.getAccessToken();

}

app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
    main();
});
