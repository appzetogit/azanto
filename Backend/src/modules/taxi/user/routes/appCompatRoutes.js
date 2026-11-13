/**
 * Endpoints the customer mobile app calls that this backend never had.
 *
 * Found in the production request log: every one of these was a 404 on every
 * call (fcm-token 93, trip-category 158, route 83, user-home-management 90,
 * vehicle-map-icons 32, cancellation-reasons 26, settings/ride-voice 2 over a
 * few days). Each is built on logic that already exists here, so its answer
 * agrees with what the rest of the backend does:
 *
 *   POST /users/fcm-token            the token store taxi pushes read from
 *   GET  /users/trip-category        the same zone check ride booking uses
 *   GET  /users/route                Google Directions, straight-line fallback
 *   GET  /users/vehicle-map-icons    the vehicle records' own icons
 *   GET  /user-home-management       taxi banners, Rides hero banners, modules
 *   GET  /users/cancellation-reasons a default list (no reasons model exists)
 *   GET  /users/settings/ride-voice  off (no voice setting exists)
 *
 * Mounted at /api/v1/taxi, ahead of the other taxi routers.
 */
import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { authenticateOrResolveUser } from '../../middlewares/authMiddleware.js';

export const appCompatRouter = Router();

/** "lat,lng" (as the app sends it) -> { lat, lng }, or null. */
const parseLatLng = (value) => {
  const parts = String(value || '').split(',').map((s) => Number(String(s).trim()));
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

// ------------------------------------------------------------ fcm-token ----

/*
 * Same store and same validation as POST /fcm-tokens/mobile/save: the user's
 * fcmTokenMobile, which taxi pushes (pushNotificationService) already read.
 */
appCompatRouter.post('/users/fcm-token', authenticateOrResolveUser(['user']), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const token = String(body.token ?? body.fcmToken ?? body.fcm_token ?? body.deviceToken ?? '').trim();
  if (token.length < 20 || token.length > 4096) {
    throw new ApiError(400, 'A valid FCM token is required');
  }
  const { upsertFirebaseDeviceToken } = await import('../../../../core/notifications/firebase.service.js');
  await upsertFirebaseDeviceToken({ ownerType: 'USER', ownerId: String(req.auth.sub), token, platform: 'mobile' });
  res.json({ success: true, message: 'Token saved', data: { saved: true } });
}));

// -------------------------------------------------------- trip-category ----

/*
 * City or outstation, by the rule ride booking enforces
 * (matchingService.assertTripInsidePickupZone): a drop inside the pickup's
 * zone is a city ride; outside it, outstation. No zone at the pickup means
 * rides are not offered there.
 */
appCompatRouter.get('/users/trip-category', asyncHandler(async (req, res) => {
  const pickup = parseLatLng(req.query.pickup);
  const drop = parseLatLng(req.query.drop);
  if (!pickup || !drop) {
    throw new ApiError(400, 'pickup and drop are required as "lat,lng"');
  }
  const { findZoneByPickup, pointInZoneGeometry } = await import('../../services/matchingService.js');
  const zone = await findZoneByPickup([pickup.lng, pickup.lat]);
  if (!zone) {
    return res.json({
      success: true,
      data: {
        category: 'unserviceable',
        tripCategory: 'unserviceable',
        serviceable: false,
        isOutstation: false,
        zone: null,
        message: 'Rides are not available at this pickup location yet.',
      },
    });
  }
  const inside = pointInZoneGeometry([drop.lng, drop.lat], zone.geometry);
  const category = inside ? 'city' : 'outstation';
  return res.json({
    success: true,
    data: {
      category,
      tripCategory: category,
      serviceable: true,
      isOutstation: !inside,
      zone: { id: String(zone._id), name: zone.name || '' },
      message: '',
    },
  });
}));

// ---------------------------------------------------------------- route ----

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const routeCache = new Map();
const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/*
 * The line the map draws between two points, with its distance and time.
 * Google Directions, as the food tracking route does (order-route.service);
 * when no key is set or Directions fails, a straight-line estimate so the map
 * still has something. Cached briefly by rounded endpoints: the app asks again
 * on every map redraw.
 */
appCompatRouter.get('/users/route', asyncHandler(async (req, res) => {
  const origin = parseLatLng(req.query.origin);
  const destination = parseLatLng(req.query.destination);
  if (!origin || !destination) {
    throw new ApiError(400, 'origin and destination are required as "lat,lng"');
  }

  const key = [origin.lat, origin.lng, destination.lat, destination.lng].map((n) => n.toFixed(4)).join(',');
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ROUTE_CACHE_TTL_MS) {
    return res.json({ success: true, data: hit.value });
  }

  const straightKm = haversineKm(origin, destination);
  let value = {
    origin,
    destination,
    polyline: '',
    points: [origin, destination],
    distanceKm: Number(straightKm.toFixed(2)),
    distanceMeters: Math.round(straightKm * 1000),
    durationMinutes: Math.max(1, Math.round((straightKm / 25) * 60)),
    source: 'straight_line',
  };

  try {
    const { getGoogleMapsApiKey } = await import('../../../../core/settings/mapSettings.service.js');
    const apiKey = (await getGoogleMapsApiKey().catch(() => '')) || process.env.GOOGLE_MAPS_API_KEY || '';
    if (apiKey) {
      const url = 'https://maps.googleapis.com/maps/api/directions/json'
        + `?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`
        + `&mode=driving&key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      const route = data?.status === 'OK' ? data.routes?.[0] : null;
      const leg = route?.legs?.[0];
      if (route && leg) {
        const meters = Number(leg.distance?.value || 0);
        value = {
          ...value,
          polyline: route.overview_polyline?.points || '',
          distanceKm: Number((meters / 1000).toFixed(2)),
          distanceMeters: meters,
          durationMinutes: Math.max(1, Math.round(Number(leg.duration?.value || 0) / 60)),
          source: 'google_directions',
        };
      }
    }
  } catch {
    // Keep the straight-line answer: a missing road line is cosmetic.
  }

  routeCache.set(key, { at: Date.now(), value });
  if (routeCache.size > 2000) routeCache.delete(routeCache.keys().next().value);
  return res.json({ success: true, data: value });
}));

// ---------------------------------------------------- vehicle-map-icons ----

/** Each vehicle's marker, with the same fallback the driver profile uses. */
appCompatRouter.get('/users/vehicle-map-icons', asyncHandler(async (_req, res) => {
  const { Vehicle } = await import('../../admin/models/Vehicle.js');
  const rows = await Vehicle.find({ status: { $ne: 0 } })
    .select('name icon_types transport_type map_icon icon image')
    .lean();
  const results = rows.map((v) => ({
    id: String(v._id),
    _id: v._id,
    name: v.name || '',
    icon_types: v.icon_types || 'car',
    transport_type: v.transport_type || 'taxi',
    map_icon: v.map_icon || v.icon || v.image || '',
    icon: v.icon || v.map_icon || v.image || '',
    image: v.image || '',
  }));
  const icons = Object.fromEntries(results.map((r) => [r.id, r.map_icon]));
  res.json({ success: true, data: { results, icons } });
}));

// ------------------------------------------------- user-home-management ----

/*
 * The taxi home screen's managed content, from what the admin panel already
 * manages: taxi promotion banners, the Rides hero banners, and the home tiles.
 */
appCompatRouter.get('/user-home-management', asyncHandler(async (_req, res) => {
  const [{ Banner }, { FoodHeroBanner }, adminService] = await Promise.all([
    import('../../admin/promotions/models/Banner.js'),
    import('../../../food/landing/models/heroBanner.model.js'),
    import('../../admin/services/adminService.js'),
  ]);
  const [banners, heroBanners, modules] = await Promise.all([
    Banner.find({ active: { $ne: false } }).sort({ createdAt: -1 }).limit(20).lean(),
    FoodHeroBanner.find({ isActive: true, module: 'taxi' }).sort({ sortOrder: 1 }).lean().catch(() => []),
    adminService.listAppModules({ limit: 50 }).catch(() => ({ results: [] })),
  ]);
  res.json({
    success: true,
    data: {
      banners: banners.map((b) => ({
        _id: b._id,
        title: b.title || '',
        image: b.image || '',
        link: b.redirect_url || b.external_link || b.deep_link || '',
      })),
      heroBanners: heroBanners.map((b) => ({
        _id: b._id,
        title: b.title || '',
        image: b.imageUrl || b.image || b.mediaUrl || '',
        link: b.link || b.redirectUrl || '',
      })),
      appModules: modules?.results || modules?.data || [],
    },
  });
}));

// -------------------------------------------------- cancellation-reasons ----

/*
 * No reasons are stored anywhere: a cancel sends free text, which is kept on
 * the ride as cancellation_reason. These are the choices offered until an
 * admin-managed list exists; whichever is picked is sent back as that text.
 */
const DEFAULT_REASONS = {
  user: [
    'Driver is taking too long',
    'Driver asked me to cancel',
    'Changed my plans',
    'Booked by mistake',
    'Wrong pickup location',
    'Found another ride',
    'Fare is too high',
    'Other',
  ],
  driver: [
    'Customer not reachable',
    'Customer asked me to cancel',
    'Pickup location is too far',
    'Vehicle issue',
    'Unsafe pickup location',
    'Other',
  ],
};

appCompatRouter.get('/users/cancellation-reasons', asyncHandler(async (req, res) => {
  const audience = String(req.query.audience || 'user').toLowerCase() === 'driver' ? 'driver' : 'user';
  const results = DEFAULT_REASONS[audience].map((reason, index) => ({
    id: `${audience}-${index + 1}`,
    _id: `${audience}-${index + 1}`,
    reason,
    title: reason,
    audience,
    user_type: audience,
    active: true,
  }));
  res.json({ success: true, data: { results, reasons: results } });
}));

// ----------------------------------------------------- ride-voice setting ----

/*
 * No voice-announcement setting exists. Off: that is what the app has had all
 * along, since this call always failed.
 */
appCompatRouter.get('/users/settings/ride-voice', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { enabled: false, rideVoice: false, language: 'en' } });
}));
