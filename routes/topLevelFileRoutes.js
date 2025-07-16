// backend/routes/topLevelFileRoutes.js
import express from 'express';
const router = express.Router();
import { deleteFile } from '../controllers/fileController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

// Route for deleting a file by its unique ID
router.route('/:fileId').delete(protect, authorize('Admin', 'Staff'), deleteFile);

export default router;