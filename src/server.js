import express from 'express';
import dotenv from 'dotenv';
import OAuthService from './services/OAuthService.js';
import authRoutes from './routes/authRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
import DatabaseService from './services/DatabaseService.js';
import AIService from './services/AIService.js';
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
        
        // Test AI connection
        console.log('Testing AI API connection...');
        const aiService = new AIService();
        await aiService.testConnection();
        console.log('AI API connection successful');

        // Log cost savings summary
        const savings = await DatabaseService.getCostSavingsSummary();
        if (savings.overall) {
            console.log('Total savings across all shipments:');
            console.log(`- Amount: ${savings.overall[0].total_savings} ${savings.overall[0].currency}`);
            const avgPercentage = parseFloat(savings.overall[0].avg_savings_percentage) || 0;
            console.log(`- Percentage: ${avgPercentage.toFixed(2)}%`);
        }
    } catch (error) {
        console.error('Startup error:', error);
        process.exit(1);
    }
    await OAuthService.getAccessToken();

}

app.listen(port, () => {
  console.log('Starting server... 1');
    console.log(`Server läuft auf http://localhost:${port}`);
    main();
});
