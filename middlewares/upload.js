const multer = require('multer');
const path = require('path');
const fs = require('fs');

const directories = [
    './uploads',
    './uploads/profileImages',
    './uploads/logos',
    './uploads/types',
    './uploads/jsonFiles',
    './uploads/zipFiles',
    './uploads/envato',
];

directories.forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storageEngines = {
    profileImages: multer.diskStorage({
        destination: './uploads/profileImages',
        filename: function (req, file, cb) {
            cb(null, `${req.userId}-${Date.now()}${path.extname(file.originalname)}`);
        }
    }),
    logos: multer.diskStorage({
        destination: './uploads/logos',
        filename: function (req, file, cb) {
            cb(null, `logo-${Date.now()}${path.extname(file.originalname)}`);
        }
    }),
    types: multer.diskStorage({
        destination: './uploads/types',
        filename: function (req, file, cb) {
            cb(null, `type-${Date.now()}${path.extname(file.originalname)}`);
        }
    }),
    jsonFiles: multer.diskStorage({
        destination: './uploads/jsonFiles',
        filename: function (req, file, cb) {
            cb(null, `data-${Date.now()}${path.extname(file.originalname)}`);
        }
    }),
    zipFiles: multer.diskStorage({
        destination: './uploads/zipFiles',
        filename: function (req, file, cb) {
            cb(null, `extension-${file.originalname}`);
        }
    })
};

function checkFileType(file, cb) {
    const imageFileTypes = /jpeg|jpg|png/;
    const jsonFileTypes = /json/;
    const zipFileTypes = /zip/;

    let extname;
    let mimetype;

    switch (file.fieldname) {
        case 'jsonFile':
            extname = jsonFileTypes.test(path.extname(file.originalname).toLowerCase());
            mimetype = jsonFileTypes.test(file.mimetype);
            break;
        case 'zipFile':
            extname = zipFileTypes.test(path.extname(file.originalname).toLowerCase());
            mimetype = zipFileTypes.test(file.mimetype);
            break;
        default:
            extname = imageFileTypes.test(path.extname(file.originalname).toLowerCase());
            mimetype = imageFileTypes.test(file.mimetype);
            break;
    }

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type!'));
    }
}


// Initialize upload functions
const upload = {
    profileImage: multer({
        storage: storageEngines.profileImages,
        limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
        fileFilter: function (req, file, cb) {
            checkFileType(file, cb);
        }
    }).single('profileImage'),

    logo: multer({
        storage: storageEngines.logos,
        limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
        fileFilter: function (req, file, cb) {
            checkFileType(file, cb);
        }
    }).single('logo'),

    types: multer({
        storage: storageEngines.types,
        limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
        fileFilter: function (req, file, cb) {
            checkFileType(file, cb);
        }
    }).single('typeLogo'),

    jsonFile: multer({
        storage: storageEngines.jsonFiles,
        limits: { fileSize: 1024 * 1024 * 2 }, // 2MB limit for JSON files
        fileFilter: function (req, file, cb) {
            checkFileType(file, cb);
        }
    }).single('jsonFile'),

    zipFile: multer({
        storage: storageEngines.zipFiles,
        limits: { fileSize: 1024 * 1024 * 120 }, // 20MB limit for zip files
        fileFilter: function (req, file, cb) {
            checkFileType(file, cb);
        }
    }).single('zipFile')
};

module.exports = { upload };
