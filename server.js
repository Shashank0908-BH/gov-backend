// backend/server.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url'; // Import for ES module pathing

import caseRoutes from './routes/caseRoutes.js';
import userRoutes from './routes/userRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import topLevelFileRoutes from './routes/topLevelFileRoutes.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// --- Static Folder Correction ---
// This is the correct way to get the directory name in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve uploaded files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- Main Routes ---
app.use('/api/users', userRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/cases/:caseId/files', fileRoutes);
app.use('/api/files', topLevelFileRoutes);

// Test Route
app.get('/', (req, res) => {
    res.send('Government Case Management API is running...');
});

// Start the server
app.listen(PORT, () => {
    console.log(`✅ Server is running and listening on port ${PORT}`);
});