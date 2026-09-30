import { Router } from 'express';
import { AddressController } from '../controllers/address.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All address routes require user authentication
router.use(authenticate);

router.post('/', AddressController.createAddress);
router.get('/', AddressController.listAddresses);
router.get('/:id', AddressController.getAddress);
router.patch('/:id', AddressController.updateAddress);
router.delete('/:id', AddressController.deleteAddress);
router.patch('/:id/default', AddressController.setDefaultAddress);

export default router;
