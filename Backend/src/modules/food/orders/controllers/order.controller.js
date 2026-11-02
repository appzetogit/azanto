import { sendResponse } from '../../../../utils/response.js';
import * as orderService from '../services/order.service.js';
import * as foodOrderPaymentService from '../services/foodOrderPayment.service.js';

import {
    validateCalculateOrderDto,
    validateCreateOrderDto,
    validateVerifyPaymentDto,
    validateCancelOrderDto,
    validateOrderStatusDto,
    validateDispatchSettingsDto,
    validateOrderRatingsDto,
    validateCustomerRatingDto
} from '../validators/order.validator.js';

export async function calculateOrderController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const dto = validateCalculateOrderDto(req.body);
        const result = await orderService.calculateOrder(userId, dto);
        return sendResponse(res, 200, 'Pricing calculated', result);
    } catch (err) {
        next(err);
    }
}

export async function createOrderController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const dto = validateCreateOrderDto(req.body);
        const result = await orderService.createOrder(userId, dto);
        return sendResponse(res, 201, 'Order placed successfully', result);
    } catch (err) {
        next(err);
    }
}

export async function verifyPaymentController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const dto = validateVerifyPaymentDto(req.body);
        const result = await orderService.verifyPayment(userId, dto);
        return sendResponse(res, 200, 'Payment verified', result);
    } catch (err) {
        next(err);
    }
}

export async function listOrdersUserController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const result = await orderService.listOrdersUser(userId, req.query);
        return sendResponse(res, 200, 'Orders retrieved', result);
    } catch (err) {
        next(err);
    }
}

export async function getOrderByIdUserController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.getOrderById(orderId, { userId });
        return sendResponse(res, 200, 'Order retrieved', { order });
    } catch (err) {
        next(err);
    }
}

export async function getOrderDropOtpUserController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const orderId = req.params.orderId;
        const result = await orderService.getDropOtpUser(orderId, userId);
        return sendResponse(res, 200, 'Drop OTP retrieved', result);
    } catch (err) {
        next(err);
    }
}

/** Ledger rows from `food_order_payments` (append-only audit trail) */
export async function getOrderPaymentsUserController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const orderId = req.params.orderId;
        const result = await foodOrderPaymentService.listFoodOrderPaymentsForUser(orderId, userId);
        return sendResponse(res, 200, 'Payment history', result);
    } catch (err) {
        next(err);
    }
}

export async function cancelOrderController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const orderId = req.params.orderId;
        const dto = validateCancelOrderDto(req.body);
        const order = await orderService.cancelOrder(orderId, userId, dto.reason);
        return sendResponse(res, 200, 'Order cancelled', { order });
    } catch (err) {
        next(err);
    }
}

export async function submitOrderRatingsController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const orderId = req.params.orderId;
        const dto = validateOrderRatingsDto(req.body);
        const order = await orderService.submitOrderRatings(orderId, userId, dto);
        return sendResponse(res, 200, 'Ratings submitted successfully', { order });
    } catch (err) {
        next(err);
    }
}

export async function rateCustomerDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const dto = validateCustomerRatingDto(req.body);
        const result = await orderService.submitCustomerRating(
            req.params.orderId,
            deliveryPartnerId,
            dto
        );
        return sendResponse(res, 200, 'Customer rated successfully', result);
    } catch (err) {
        next(err);
    }
}

export async function updateOrderInstructionsController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const orderId = req.params.orderId;
        const instructions = req.body.instructions;
        const order = await orderService.updateOrderInstructions(orderId, userId, instructions);
        return sendResponse(res, 200, 'Instructions updated successfully', { order });
    } catch (err) {
        next(err);
    }
}

export async function getDispatchSettingsController(req, res, next) {
    try {
        const result = await orderService.getDispatchSettings();
        return sendResponse(res, 200, 'Dispatch settings retrieved', result);
    } catch (err) {
        next(err);
    }
}

export async function updateDispatchSettingsController(req, res, next) {
    try {
        const adminId = req.user?.userId;
        const dto = validateDispatchSettingsDto(req.body);
        const result = await orderService.updateDispatchSettings(dto.dispatchMode, adminId);
        return sendResponse(res, 200, 'Dispatch settings updated', result);
    } catch (err) {
        next(err);
    }
}

export async function listOrdersRestaurantController(req, res, next) {
    try {
        const restaurantId = req.user?.userId;
        const result = await orderService.listOrdersRestaurant(restaurantId, req.query);
        return sendResponse(res, 200, 'Orders retrieved', result);
    } catch (err) {
        next(err);
    }
}

export async function getOrderByIdRestaurantController(req, res, next) {
    try {
        const restaurantId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.getOrderById(orderId, { restaurantId });
        return sendResponse(res, 200, 'Order retrieved', { order });
    } catch (err) {
        next(err);
    }
}

/**
 * Admin equivalent of updateOrderStatusRestaurantController.
 * Admins act across restaurants, so no restaurantId scoping — but the same kitchen-status
 * whitelist applies (picked_up / delivered stay owned by the delivery + OTP flow).
 */
export async function updateOrderStatusAdminController(req, res, next) {
    try {
        const orderId = req.params.orderId;
        const dto = validateOrderStatusDto(req.body);
        const order = await orderService.updateOrderStatusRestaurant(
            orderId,
            null,
            dto.orderStatus,
            dto.note,
            { role: 'ADMIN', id: req.user?.userId || req.auth?.sub || null },
        );
        return sendResponse(res, 200, 'Order status updated', { order });
    } catch (err) {
        next(err);
    }
}

export async function updateOrderStatusRestaurantController(req, res, next) {
    try {
        const restaurantId = req.user?.userId;
        const orderId = req.params.orderId;
        const dto = validateOrderStatusDto(req.body);
        const order = await orderService.updateOrderStatusRestaurant(orderId, restaurantId, dto.orderStatus, dto.note);
        return sendResponse(res, 200, 'Order status updated', { order });
    } catch (err) {
        next(err);
    }
}

export async function listOrdersAvailableDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const result = await orderService.listOrdersAvailableDelivery(deliveryPartnerId, req.query);
        return sendResponse(res, 200, 'Orders retrieved', result);
    } catch (err) {
        next(err);
    }
}

export async function acceptOrderDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.acceptOrderDelivery(orderId, deliveryPartnerId);
        return sendResponse(res, 200, 'Order accepted', { order });
    } catch (err) {
        next(err);
    }
}

export async function rejectOrderDeliveryController(req, res, next) {
    try {
        // Optional: shown to the admins when the rider declines an order they assigned.
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : '';
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.rejectOrderDelivery(orderId, deliveryPartnerId, { reason });
        return sendResponse(res, 200, 'Order rejected', { order });
    } catch (err) {
        next(err);
    }
}

export async function confirmReachedPickupDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.confirmReachedPickupDelivery(orderId, deliveryPartnerId);
        return sendResponse(res, 200, 'Reached pickup confirmed', { order });
    } catch (err) {
        next(err);
    }
}

export async function confirmPickupDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const { billImageUrl } = req.body;
        const order = await orderService.confirmPickupDelivery(orderId, deliveryPartnerId, billImageUrl);
        return sendResponse(res, 200, 'Pickup confirmed', { order });
    } catch (err) {
        next(err);
    }
}

/**
 * The pharmacy / restaurant bill, photographed by the rider at pickup.
 * Body: { base64, mimeType? }. Returns { url } for confirm-pickup's billImageUrl.
 * Only the rider carrying the order may upload, only images, at most 8MB.
 */
export async function uploadPickupBillPhotoController(req, res, next) {
    try {
        const riderId = String(req.user?.userId || '');
        const orderId = req.params.orderId;
        const mongoose = (await import('mongoose')).default;
        const byId = mongoose.Types.ObjectId.isValid(orderId)
            ? { _id: new mongoose.Types.ObjectId(orderId) }
            : { $or: [{ order_id: orderId }, { orderId }] };
        const { FoodOrder } = await import('../models/order.model.js');
        const row = await FoodOrder.findOne(byId).select('dispatch.deliveryPartnerId').lean();
        const assigned = row && String(row.dispatch?.deliveryPartnerId || '') === riderId;
        if (!assigned) return sendResponse(res, 403, 'Not your order', null);

        const base64 = String(req.body?.base64 || '').replace(/^data:[^,]*,/, '');
        if (!base64) return sendResponse(res, 400, 'base64 is required', null);
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
            return sendResponse(res, 400, 'Bill photo must be an image up to 8MB', null);
        }
        const { detectMimeType } = await import('../../../../services/storage.service.js');
        if (!String(detectMimeType(buffer) || '').startsWith('image/')) {
            return sendResponse(res, 400, 'Bill photo must be an image (JPG, PNG or WebP)', null);
        }
        const { uploadImageBuffer } = await import('../../../../services/cloudinary.service.js');
        const url = await uploadImageBuffer(buffer, 'delivery/pickup-bills');
        return sendResponse(res, 200, 'Bill photo uploaded', { url });
    } catch (err) {
        next(err);
    }
}

export async function confirmReachedDropDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.confirmReachedDropDelivery(orderId, deliveryPartnerId);
        return sendResponse(res, 200, 'Reached drop confirmed', { order });
    } catch (err) {
        next(err);
    }
}

/** GET /food/delivery/orders/:orderId/route — rider's own map. */
export async function getOrderRouteDeliveryController(req, res, next) {
    try {
        const data = await orderService.getOrderRoute(req.params.orderId, {
            lat: req.query.lat,
            lng: req.query.lng,
            target: req.query.target,
        }, { deliveryPartnerId: req.user?.userId });
        return sendResponse(res, 200, 'Route', data);
    } catch (err) {
        next(err);
    }
}

/** GET /food/orders/:orderId/route — customer tracking map. Origin and leg are
 *  both resolved server-side; the customer has no business choosing either. */
export async function getOrderRouteUserController(req, res, next) {
    try {
        const data = await orderService.getOrderRoute(req.params.orderId, {}, { userId: req.user?.userId });
        return sendResponse(res, 200, 'Route', data);
    } catch (err) {
        next(err);
    }
}

export async function verifyDropOtpDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const { otp } = req.body;
        const result = await orderService.verifyDropOtpDelivery(orderId, deliveryPartnerId, otp);
        return sendResponse(res, 200, 'OTP verified', { order: result.order });
    } catch (err) {
        next(err);
    }
}

export async function completeDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.completeDelivery(orderId, deliveryPartnerId, req.body || {});
        return sendResponse(res, 200, 'Delivery completed', { order });
    } catch (err) {
        next(err);
    }
}

export async function updateOrderStatusDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const dto = validateOrderStatusDto(req.body);
        const order = await orderService.updateOrderStatusDelivery(orderId, deliveryPartnerId, dto.orderStatus);
        return sendResponse(res, 200, 'Order status updated', { order });
    } catch (err) {
        next(err);
    }
}

export async function getCurrentTripDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const order = await orderService.getCurrentTripDelivery(deliveryPartnerId);
        // Every order on the trip, first accepted first. `activeOrder` stays for
        // app builds that know only one.
        const food = await orderService.getCurrentTripsDelivery(deliveryPartnerId).catch(() => []);
        const acceptedAt = (o) => new Date(o?.dispatch?.acceptedAt || o?.createdAt || 0).getTime();
        const activeOrders = [...food].sort((a, b) => acceptedAt(a) - acceptedAt(b));
        return sendResponse(res, 200, 'Current trip retrieved', { activeOrder: order || null, activeOrders });
    } catch (err) {
        next(err);
    }
}

export async function createCollectQrController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const customerInfo = req.body || {};
        const result = await orderService.createCollectQr(orderId, deliveryPartnerId, customerInfo);
        return sendResponse(res, 200, 'QR created', result);
    } catch (err) {
        next(err);
    }
}

export async function getOrderByIdDeliveryController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const order = await orderService.getOrderById(orderId, { deliveryPartnerId });
        return sendResponse(res, 200, 'Order retrieved', { order });
    } catch (err) {
        next(err);
    }
}


export async function getPaymentStatusController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const result = await orderService.getPaymentStatus(orderId, deliveryPartnerId);
        return sendResponse(res, 200, 'Payment status retrieved', result);
    } catch (err) {
        next(err);
    }
}

export async function switchToCashController(req, res, next) {
    try {
        const deliveryPartnerId = req.user?.userId;
        const orderId = req.params.orderId;
        const result = await orderService.switchToCash(orderId, deliveryPartnerId);
        return sendResponse(res, 200, 'Switched to cash collection', result);
    } catch (err) {
        next(err);
    }
}


export async function listOrdersAdminController(req, res, next) {
    try {
        const result = await orderService.listOrdersAdmin(req.query);
        return sendResponse(res, 200, 'Orders retrieved', result);
    } catch (err) {
        next(err);
    }
}

export async function getOrderByIdAdminController(req, res, next) {
    try {
        const orderId = req.params.orderId;
        const order = await orderService.getOrderById(orderId, { admin: true });
        return sendResponse(res, 200, 'Order retrieved', { order });
    } catch (err) {
        next(err);
    }
}

export async function deleteOrderAdminController(req, res, next) {
    try {
        const adminId = req.user?.userId;
        const orderId = req.params.orderId;
        const result = await orderService.deleteOrderAdmin(orderId, adminId);
        return sendResponse(res, 200, 'Order deleted successfully', result);
    } catch (err) {
        next(err);
    }
}

export async function resendDeliveryNotificationRestaurantController(req, res, next) {
    try {
        const restaurantId = req.user?.userId;
        const orderId = req.params.orderId;
        const result = await orderService.resendDeliveryNotificationRestaurant(orderId, restaurantId);
        return sendResponse(res, 200, 'Notification resent successfully', result);
    } catch (err) {
        next(err);
    }
}

export async function listPetpoojaSyncLogsController(req, res, next) {
    try {
        const { listPetpoojaSyncLogs } = await import('../services/petpooja.service.js');
        const result = await listPetpoojaSyncLogs(req.query || {});
        return sendResponse(res, 200, 'Sync logs retrieved successfully', result);
    } catch (err) {
        next(err);
    }
}

export async function retryPetpoojaSyncLogController(req, res, next) {
    try {
        const { retryPetpoojaSyncLog } = await import('../services/petpooja.service.js');
        const logId = req.params.logId;
        const result = await retryPetpoojaSyncLog(logId);
        return sendResponse(res, 200, 'Retry initiated successfully', result);
    } catch (err) {
        next(err);
    }
}
