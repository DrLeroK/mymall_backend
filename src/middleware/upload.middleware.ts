import { Request, Response, NextFunction } from 'express';
import { upload } from '../config/multer';

export const uploadBranding = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'banner', maxCount: 1 },
]);

export const uploadScreenshot = upload.single('screenshot');

export const uploadProductImages = upload.array('productImages', 5);
export const uploadAnyImage = upload.any();
