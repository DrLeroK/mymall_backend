import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export class StorageService {
  private static s3Client: S3Client | null = null;

  /**
   * Determine if Cloudflare R2 is configured and active
   */
  public static isR2Configured(): boolean {
    return Boolean(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
    );
  }

  /**
   * Lazily initialize and return the S3 client for Cloudflare R2
   */
  private static getS3Client(): S3Client {
    if (!this.s3Client) {
      const accountId = process.env.R2_ACCOUNT_ID;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;

      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
    return this.s3Client;
  }

  /**
   * Upload an uploaded file to storage (Cloudflare R2 if configured, otherwise local disk)
   *
   * @param file Express.Multer.File object (with either .path or .buffer)
   * @param folder Target folder category ('products' | 'branding' | 'screenshots' | 'general')
   * @returns Public URL of the uploaded image
   */
  public static async uploadFile(
    file: Express.Multer.File,
    folder: 'products' | 'branding' | 'screenshots' | 'general' = 'general'
  ): Promise<string> {
    if (!file) throw new Error('No file provided for upload.');

    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${folder}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    // --- OPTION A: Cloudflare R2 (S3 API) ---
    if (this.isR2Configured()) {
      try {
        const client = this.getS3Client();
        const bucket = process.env.R2_BUCKET_NAME!;
        const key = `${folder}/${uniqueName}`;

        let fileBuffer: Buffer;
        if (file.buffer) {
          fileBuffer = file.buffer;
        } else if (file.path && fs.existsSync(file.path)) {
          fileBuffer = fs.readFileSync(file.path);
        } else {
          throw new Error('File buffer or path not found on upload object.');
        }

        const mimeType = file.mimetype || 'image/jpeg';

        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fileBuffer,
            ContentType: mimeType,
          })
        );

        // Clean up temporary local disk file if it was saved by multer
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch {}
        }

        // Generate public URL
        const publicDomain = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');
        if (publicDomain) {
          return `${publicDomain}/${key}`;
        }
        return `https://${bucket}.r2.dev/${key}`;
      } catch (err: any) {
        console.warn(`[StorageService] Cloudflare R2 upload failed, falling back to local storage: ${err.message}`);
      }
    }

    // --- OPTION B: Local Disk Fallback (Zero-Config / Offline / Dev) ---
    const targetDir = path.join(__dirname, '../../uploads', folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (file.path && fs.existsSync(file.path)) {
      const filename = path.basename(file.path);
      const actualFolder = path.basename(path.dirname(file.path));
      if (actualFolder !== folder) {
        const destPath = path.join(targetDir, filename);
        fs.renameSync(file.path, destPath);
      }
      return `/uploads/${folder}/${filename}`;
    } else if (file.buffer) {
      const targetPath = path.join(targetDir, uniqueName);
      fs.writeFileSync(targetPath, file.buffer);
      return `/uploads/${folder}/${uniqueName}`;
    }

    throw new Error('Unable to store uploaded file.');
  }

  /**
   * Upload multiple files in parallel
   */
  public static async uploadMultipleFiles(
    files: Express.Multer.File[],
    folder: 'products' | 'branding' | 'screenshots' | 'receipts' | 'general' = 'products'
  ): Promise<string[]> {
    if (!files || files.length === 0) return [];
    return Promise.all(files.map((f) => this.uploadFile(f, folder as any)));
  }

  /**
   * Upload a memory buffer (e.g. generated digital receipt) to storage
   */
  public static async uploadBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    folder: 'products' | 'branding' | 'screenshots' | 'receipts' | 'general' = 'receipts'
  ): Promise<string> {
    if (!buffer) throw new Error('No buffer provided for upload.');

    const uniqueName = filename || `${folder}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.html`;

    // --- OPTION A: Cloudflare R2 (S3 API) ---
    if (this.isR2Configured()) {
      try {
        const client = this.getS3Client();
        const bucket = process.env.R2_BUCKET_NAME!;
        const key = `${folder}/${uniqueName}`;

        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
          })
        );

        const publicDomain = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');
        if (publicDomain) {
          return `${publicDomain}/${key}`;
        }
        return `https://${bucket}.r2.dev/${key}`;
      } catch (err: any) {
        console.warn(`[StorageService] Cloudflare R2 uploadBuffer failed, falling back to local storage: ${err.message}`);
      }
    }

    // --- OPTION B: Local Disk Fallback ---
    const uploadsDir = path.join(__dirname, '../../uploads', folder);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const targetPath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(targetPath, buffer);
    return `/uploads/${folder}/${uniqueName}`;
  }
}
