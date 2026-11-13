import { createDeliveryRecord, getActiveDeliveryForIdentity, getDeliveryById, listDeliveriesForIdentity } from '../services/deliveryService.js';
import { quoteRideFares } from '../../services/rideService.js';
import { Vehicle } from '../../admin/models/Vehicle.js';
import { normalizePoint } from '../../../../utils/geo.js';
import { ApiError } from '../../../../utils/ApiError.js';

/** [lng, lat] from either an array or a {lat, lng} / {latitude, longitude} object. */
const toLngLat = (value, field) => {
  if (Array.isArray(value)) return normalizePoint(value, field);
  if (value && typeof value === 'object') {
    const lat = value.lat ?? value.latitude;
    const lng = value.lng ?? value.lon ?? value.longitude;
    return normalizePoint([lng, lat], field);
  }
  throw new ApiError(400, `${field} is required`);
};

/**
 * POST /taxi/deliveries/quote -- what each parcel vehicle costs for this trip.
 *
 * The user app's parcel screen asks here for its prices. The route did not
 * exist, so every call was a 404, the screen had no prices, and it showed no
 * parcel vehicles at all. Priced by the same calculation the booking charges
 * (quoteRideFares, also behind /rides/quote) with transport type 'delivery',
 * including the goods type's weight-slot extra.
 *
 * With no vehicle ids given, every active parcel vehicle is quoted. When the
 * admin has switched Taxi/Parcel off at the pickup, the quotes still come back
 * but `serviceAvailable` is false with the admin's message, so the app can say
 * so; booking is refused regardless (createRideRecord).
 */
export const quoteDelivery = async (req, res) => {
  const body = req.body || {};
  const parcel = body.parcel || {};
  const pickupCoords = toLngLat(body.pickup ?? body.pickupLocation, 'pickup');
  const dropCoords = toLngLat(body.drop ?? body.dropLocation, 'drop');

  let vehicleTypeIds = Array.isArray(body.vehicleTypeIds)
    ? body.vehicleTypeIds
    : [body.vehicleTypeId].filter(Boolean);
  if (!vehicleTypeIds.length) {
    const vehicles = await Vehicle.find({ transport_type: { $in: ['delivery', 'both'] }, status: 1 })
      .select('_id')
      .lean();
    vehicleTypeIds = vehicles.map((v) => String(v._id));
  }

  const quotes = await quoteRideFares({
    pickupCoords,
    dropCoords,
    stops: body.stops,
    vehicleTypeIds,
    transport_type: 'delivery',
    service_location_id: body.service_location_id || body.serviceLocationId,
    weightSlotId: body.weightSlotId ?? parcel.weightSlotId,
    goodsTypeId: body.goodsTypeId ?? parcel.goodsTypeId,
  });

  const { appServiceClosedMessage } = await import('../../../../core/appServices/appServices.service.js');
  const closedMessage = await appServiceClosedMessage('taxi', { lat: pickupCoords[1], lng: pickupCoords[0] });

  res.json({
    success: true,
    data: {
      quotes,
      // Same list under the names a client may look for.
      results: quotes,
      serviceAvailable: !closedMessage,
      message: closedMessage || '',
    },
  });
};

export const createDelivery = async (req, res) => {
  const { pickup, drop, pickupAddress, dropAddress, fare, vehicleTypeId, vehicleTypeIds, vehicleIconType, vehicleIconUrl, paymentMethod, parcel } = req.body;

  const delivery = await createDeliveryRecord({
    userId: req.auth.sub,
    pickup,
    drop,
    pickupAddress,
    dropAddress,
    fare,
    vehicleTypeId,
    vehicleTypeIds,
    vehicleIconType,
    vehicleIconUrl,
    paymentMethod,
    parcel,
  });

  res.status(201).json({
    success: true,
    data: delivery,
  });
};

export const getMyActiveDelivery = async (req, res) => {
  const delivery = await getActiveDeliveryForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.json({
    success: true,
    data: delivery,
  });
};

export const getDelivery = async (req, res) => {
  const delivery = await getDeliveryById({
    deliveryId: req.params.deliveryId,
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.json({
    success: true,
    data: delivery,
  });
};

export const listMyDeliveries = async (req, res) => {
  const deliveries = await listDeliveriesForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
    limit: req.query.limit,
  });

  res.json({
    success: true,
    data: {
      results: deliveries,
      total: deliveries.length,
    },
  });
};
