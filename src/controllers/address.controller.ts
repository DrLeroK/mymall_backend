import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Validator } from '../utils/validator';

export class AddressController {
  /**
   * Create a new customer delivery address.
   * Requires explicit location sharing permission when submitting GPS coordinates.
   */
  static async createAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const {
        label = 'Home',
        recipientName,
        recipientPhone,
        streetAddress,
        city = 'Addis Ababa',
        subcity,
        postalCode,
        latitude,
        longitude,
        locationPermissionGranted = false,
        locationAccuracy,
        deliveryInstructions,
        isDefault = false,
      } = req.body;

      if (!recipientName || !recipientPhone || !streetAddress) {
        return res.status(400).json({
          success: false,
          message: 'Recipient name, phone number, and street address are required.',
        });
      }

      const hasCoordinates = latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null;

      // PERMISSION CHECK: Explicit User Consent Gate for Geolocation
      if (hasCoordinates) {
        if (!locationPermissionGranted) {
          return res.status(400).json({
            success: false,
            message: 'Location sharing permission was not granted. Please allow your device or browser to share location, or proceed using only your written street address.',
          });
        }

        const coordValidation = Validator.validateCoordinates(latitude, longitude);
        if (!coordValidation.isValid) {
          return res.status(400).json({
            success: false,
            message: coordValidation.message,
          });
        }
      }

      const address = await prisma.$transaction(async (tx) => {
        // If this address is set as default, remove default flag from user's other addresses
        if (isDefault) {
          await tx.customerAddress.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.customerAddress.create({
          data: {
            userId,
            label: Validator.sanitizeString(label),
            recipientName: Validator.sanitizeString(recipientName),
            recipientPhone: recipientPhone.trim(),
            streetAddress: Validator.sanitizeString(streetAddress),
            city: city ? Validator.sanitizeString(city) : 'Addis Ababa',
            subcity: subcity ? Validator.sanitizeString(subcity) : null,
            postalCode: postalCode ? postalCode.trim() : null,
            latitude: hasCoordinates ? parseFloat(latitude) : null,
            longitude: hasCoordinates ? parseFloat(longitude) : null,
            locationPermissionGranted: hasCoordinates ? Boolean(locationPermissionGranted) : false,
            locationAccuracy: locationAccuracy ? parseFloat(locationAccuracy) : null,
            deliveryInstructions: deliveryInstructions ? Validator.sanitizeString(deliveryInstructions) : null,
            isDefault: Boolean(isDefault),
          },
        });
      });

      return res.status(201).json({
        success: true,
        message: 'Delivery address created successfully with verified location preferences.',
        address,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * List all saved addresses for the authenticated user
   */
  static async listAddresses(req: Request, res: Response) {
    try {
      const userId = req.user!.id;

      const addresses = await prisma.customerAddress.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });

      return res.json({ success: true, count: addresses.length, addresses });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get single address by ID
   */
  static async getAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const id = parseInt(req.params.id, 10);

      const address = await prisma.customerAddress.findFirst({
        where: { id, userId },
      });

      if (!address) {
        return res.status(404).json({ success: false, message: 'Delivery address not found.' });
      }

      return res.json({ success: true, address });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update an existing delivery address
   */
  static async updateAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const id = parseInt(req.params.id, 10);
      const {
        label,
        recipientName,
        recipientPhone,
        streetAddress,
        city,
        subcity,
        postalCode,
        latitude,
        longitude,
        locationPermissionGranted,
        locationAccuracy,
        deliveryInstructions,
        isDefault,
      } = req.body;

      const existingAddress = await prisma.customerAddress.findFirst({
        where: { id, userId },
      });

      if (!existingAddress) {
        return res.status(404).json({ success: false, message: 'Delivery address not found.' });
      }

      const updateData: any = {};
      if (label !== undefined) updateData.label = Validator.sanitizeString(label);
      if (recipientName !== undefined) updateData.recipientName = Validator.sanitizeString(recipientName);
      if (recipientPhone !== undefined) updateData.recipientPhone = recipientPhone.trim();
      if (streetAddress !== undefined) updateData.streetAddress = Validator.sanitizeString(streetAddress);
      if (city !== undefined) updateData.city = Validator.sanitizeString(city);
      if (subcity !== undefined) updateData.subcity = Validator.sanitizeString(subcity);
      if (postalCode !== undefined) updateData.postalCode = postalCode ? postalCode.trim() : null;
      if (deliveryInstructions !== undefined) updateData.deliveryInstructions = Validator.sanitizeString(deliveryInstructions);

      // Coordinate update with permission verification
      if (latitude !== undefined && longitude !== undefined) {
        if (!locationPermissionGranted) {
          return res.status(400).json({
            success: false,
            message: 'Location sharing permission was not granted. Please allow your device or browser to share location to update coordinates.',
          });
        }

        const coordValidation = Validator.validateCoordinates(latitude, longitude);
        if (!coordValidation.isValid) {
          return res.status(400).json({ success: false, message: coordValidation.message });
        }

        updateData.latitude = parseFloat(latitude);
        updateData.longitude = parseFloat(longitude);
        updateData.locationPermissionGranted = true;
        if (locationAccuracy !== undefined) updateData.locationAccuracy = parseFloat(locationAccuracy);
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.customerAddress.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
          updateData.isDefault = true;
        }

        return tx.customerAddress.update({
          where: { id },
          data: updateData,
        });
      });

      return res.json({ success: true, message: 'Delivery address updated successfully.', address: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete a delivery address
   */
  static async deleteAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const id = parseInt(req.params.id, 10);

      const existing = await prisma.customerAddress.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Delivery address not found.' });
      }

      await prisma.customerAddress.delete({ where: { id } });

      return res.json({ success: true, message: 'Delivery address deleted successfully.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Set address as default
   */
  static async setDefaultAddress(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const id = parseInt(req.params.id, 10);

      const existing = await prisma.customerAddress.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Delivery address not found.' });
      }

      await prisma.$transaction([
        prisma.customerAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        }),
        prisma.customerAddress.update({
          where: { id },
          data: { isDefault: true },
        }),
      ]);

      return res.json({ success: true, message: 'Default delivery address set successfully.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
