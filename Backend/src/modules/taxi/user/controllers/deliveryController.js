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

  /*
   * The user app asks once per vehicle and reads ONE flat object
   * (azanto_flutterproject delivery_repository.dart DeliveryQuote.fromJson):
   * vehicleTypeId, vehicleName, distanceKm, baseDistanceKm, subtotal,
   * serviceTaxPercentage, serviceTaxAmount, total. It drops a vehicle whose
   * total is 0, so an unpriceable vehicle simply reports total 0.
   */
  const first = quotes[0] || null;
  let flat = {
    vehicleTypeId: first ? String(first.vehicleTypeId) : String(vehicleTypeIds[0] || ''),
    vehicleName: '',
    distanceKm: first ? Number(((first.measuredDistanceMeters || 0) / 1000).toFixed(2)) : 0,
    baseDistanceKm: 0,
    subtotal: Number(first?.fare?.subtotal || 0),
    serviceTaxPercentage: Number(first?.fare?.serviceTaxPercent || 0),
    serviceTaxAmount: Number(first?.fare?.serviceTax || 0),
    total: first?.available ? Number(first?.fare?.total || 0) : 0,
  };
  if (flat.vehicleTypeId) {
    try {
      const vehicle = await Vehicle.findById(flat.vehicleTypeId).select('name').lean();
      flat.vehicleName = vehicle?.name || '';
      const { findZoneByPickup } = await import('../../services/matchingService.js');
      const { resolveSetPriceForRide } = await import('../../services/rideService.js');
      const zone = await findZoneByPickup(pickupCoords);
      const rule = await resolveSetPriceForRide({
        zoneId: zone?._id || null,
        transportType: 'delivery',
        vehicleTypeId: flat.vehicleTypeId,
      });
      flat.baseDistanceKm = Number(rule?.base_distance || 0);
    } catch {
      // Name and base distance are display extras; the price stands without them.
    }
  }

  res.json({
    success: true,
    data: {
      ...flat,
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
