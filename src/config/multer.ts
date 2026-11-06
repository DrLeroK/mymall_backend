import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadsDir = path.join(__dirname, '../../uploads');

// Ensure subfolders exist
const folders = ['branding', 'screenshots', 'products', 'receipts', 'general', 'avatars'];
folders.forEach((folder) => {
  const dir = path.join(uploadsDir, folder);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'products';
    if (file.fieldname === 'logo' || file.fieldname === 'banner') {
      folder = 'branding';
    } else if (file.fieldname === 'screenshot') {
      folder = 'screenshots';
    } else if (file.fieldname === 'receipt') {
      folder = 'receipts';
    } else if (file.fieldname === 'avatar') {
      folder = 'avatars';
    } else {
      folder = 'products';
    }
    cb(null, path.join(uploadsDir, folder));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/svg+xml',
    'image/bmp',
  ];
  const isAllowedExt = Boolean(file.originalname.match(/\.(jpe?g|png|webp|avif|gif|svg|bmp)$/i));
  if (allowedMimeTypes.includes(file.mimetype.toLowerCase()) || isAllowedExt) {
    cb(null, true);
  } else {
    cb(new Error('Invalid image format. Allowed formats: JPEG, PNG, WebP, AVIF, GIF, and SVG.'));
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter,
});
