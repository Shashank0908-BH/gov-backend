// backend/routes/caseRoutes.js
import express from 'express';
const router = express.Router();
import {
    getAllCases,
    createCase,
    getCaseById,
    updateCase,
    deleteCase,
    generateCasePdf
} from '../controllers/caseController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

// Routes for the entire collection of cases
router.route('/')
    .get(getAllCases) // This is public for the search page
    .post(protect, authorize('Admin', 'Staff'), createCase);

// Routes for a single case by its ID
router.route('/:id')
    .get(protect, authorize('Admin', 'Staff'), getCaseById)
    .put(protect, authorize('Admin', 'Staff'), updateCase)
    .delete(protect, authorize('Admin'), deleteCase);

// Route for PDF generation for a single case
router.route('/:id/pdf')
    .get(protect, authorize('Admin', 'Staff'), generateCasePdf);

export default router;