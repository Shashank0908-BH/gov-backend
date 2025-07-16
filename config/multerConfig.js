// backend/config/multerConfig.js
import multer from 'multer';
import path from 'path';

// Set up storage engine
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb){
        // Create a unique filename: fieldname-timestamp.extension
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// Initialize upload variable
const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // Limit file size to 10MB
    fileFilter: function(req, file, cb){
        checkFileType(file, cb);
    }
}).single('caseFile'); // 'caseFile' is the name of the input field in the form

// Check File Type
function checkFileType(file, cb){
    // Allowed extensions
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    // Check extension
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type
    const mimetype = filetypes.test(file.mimetype);

    if(mimetype && extname){
        return cb(null, true);
    } else {
        cb('Error: Files of this type are not allowed!');
    }
}

export default upload;