// backend/routes/fileRoutes.js
import express from 'express';
const router = express.Router({ mergeParams: true });
import { uploadFile, getFilesForCase } from '../controllers/fileController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

router.route('/')
    .get(protect, authorize('Admin', 'Staff'), getFilesForCase);

router.route('/upload')
    .post(protect, authorize('Admin', 'Staff'), uploadFile);

export default router;