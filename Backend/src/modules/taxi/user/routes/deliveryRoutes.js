import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticateOrResolveUser } from '../../middlewares/authMiddleware.js';
import {
  createDelivery,
  getDelivery,
  getMyActiveDelivery,
  listMyDeliveries,
  quoteDelivery,
} from '../controllers/deliveryController.js';

export const deliveryRouter = Router();

// Public like /rides/quote: prices are shown before anyone books. Must be
// registered before '/:deliveryId' style routes so 'quote' is not taken as an id.
deliveryRouter.post('/quote', asyncHandler(quoteDelivery));

deliveryRouter.post('/', authenticateOrResolveUser(['user']), asyncHandler(createDelivery));
deliveryRouter.get('/', authenticateOrResolveUser(['user']), asyncHandler(listMyDeliveries));
deliveryRouter.get('/active/me', authenticateOrResolveUser(['user', 'driver']), asyncHandler(getMyActiveDelivery));
deliveryRouter.get('/:deliveryId', authenticateOrResolveUser(['user', 'driver']), asyncHandler(getDelivery));
