// backend/controllers/fileController.js
import pool from '../config/db.js';
import upload from '../config/multerConfig.js';
import fs from 'fs';

// @desc    Upload a file for a case
// @route   POST /api/cases/:caseId/upload
export const uploadFile = (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err });
        }
        if (req.file == undefined) {
            return res.status(400).json({ message: 'Error: No File Selected!' });
        }

        const { caseId } = req.params;
        const { originalname, filename, path, mimetype } = req.file;

        try {
            const newFile = await pool.query(
                'INSERT INTO case_files (case_id, original_name, stored_name, file_path, mime_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [caseId, originalname, filename, path, mimetype]
            );
            res.status(201).json({
                message: 'File uploaded successfully',
                file: newFile.rows[0]
            });
        } catch (dbError) {
            console.error(dbError);
            res.status(500).json({ message: 'Database error while saving file metadata.' });
        }
    });
};
export const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const userInfo = req.user; // We get this from the 'protect' middleware

        // First, get the file path from the database to delete it from the server
        const fileResult = await pool.query('SELECT * FROM case_files WHERE id = $1', [fileId]);
        
        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: 'File not found.' });
        }

        const file = fileResult.rows[0];
        
        // Use fs.unlink to delete the file from the /uploads directory
        fs.unlink(file.file_path, async (err) => {
            if (err) {
                console.error('Error deleting file from filesystem:', err);
                // Even if file deletion fails, we might still want to remove the DB record, or handle it differently.
                // For now, we will report an error and stop.
                return res.status(500).json({ message: 'Error deleting file from server.' });
            }

            // If file is deleted from server, delete the record from the database
            await pool.query('DELETE FROM case_files WHERE id = $1', [fileId]);
            
            res.status(200).json({ message: 'File deleted successfully.' });
        });
        
    } catch (error) {
        console.error('Error in deleteFile controller:', error);
        res.status(500).json({ message: 'Server error while deleting file.' });
    }
};
// @desc    Get all files for a specific case
// @route   GET /api/cases/:caseId/files
export const getFilesForCase = async (req, res) => {
    try {
        const { caseId } = req.params;
        const { rows } = await pool.query('SELECT * FROM case_files WHERE case_id = $1 ORDER BY uploaded_at DESC', [caseId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching files for case:', error);
        res.status(500).json({ message: 'Server error' });
    }
};