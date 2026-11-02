/**
 * Master > Delivery Radius, zone by zone: how far a store in a zone delivers.
 *
 * One number per zone per service (food, quick, medical). The zone is drawn
 * big -- a whole town -- and the radius decides each store's reach inside it:
 * a customer must be in the zone AND within this many km of the store.
 *
 *  - Quick and Medical stores have no radius of their own; the zone's is
 *    theirs. Unset means no distance limit (only the zone), as before.
 *  - Food restaurants each keep their own radius (food/shared/serviceRadius.js,
 *    enforced there). Saving a food zone's radius applies it to every
 *    restaurant in the zone, which the admin can then adjust one by one.
 *
 * Distance is a straight line here. Quick and Medical never measured road
 * distance, and a straight line can only be shorter than the road, so no store
 * is ever cut off that the road would have allowed.
 */
import mongoose from 'mongoose';

export const ZONE_RADIUS_VERTICALS = Object.freeze(['food', 'quick', 'medical']);
export const ZONE_RADIUS_LIMITS = Object.freeze({ MIN_KM: 0.5, MAX_KM: 100 });

const schema = new mongoose.Schema(
    {
        vertical: { type: String, enum: ZONE_RADIUS_VERTICALS, required: true },
        zoneId: { type: mongoose.Schema.Types.ObjectId, required: true },
        radiusKm: { type: Number, default: null },
        updatedBy: { type: String, default: '' },
    },
    { collection: 'delivery_zone_radii', timestamps: true },
);
schema.index({ vertical: 1, zoneId: 1 }, { unique: true });

export const DeliveryZoneRadius = mongoose.models.DeliveryZoneRadius
    || mongoose.model('DeliveryZoneRadius', schema, 'delivery_zone_radii');

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export class ZoneRadiusError extends Error {}

/** Blank clears; anything else must be a sensible number of km. */
export function validateZoneRadius(value) {
    if (value === null || value === undefined || String(value).trim() === '') return { ok: true, radiusKm: null };
    const km = Number(value);
    if (!Number.isFinite(km)) return { ok: false, reason: 'Enter the radius in km, or leave it blank for no limit.' };
    if (km < ZONE_RADIUS_LIMITS.MIN_KM) return { ok: false, reason: `The radius must be at least ${ZONE_RADIUS_LIMITS.MIN_KM} km.` };
    if (km > ZONE_RADIUS_LIMITS.MAX_KM) return { ok: false, reason: `The radius cannot be more than ${ZONE_RADIUS_LIMITS.MAX_KM} km.` };
    return { ok: true, radiusKm: round2(km) };
}

export function haversineKm(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
        + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A store's position, from GeoJSON `location` or latitude/longitude fields. */
export function storePoint(store) {
    const c = store?.location?.coordinates;
    const lat = Number(Array.isArray(c) ? c[1] : store?.location?.latitude ?? store?.latitude);
    const lng = Number(Array.isArray(c) ? c[0] : store?.location?.longitude ?? store?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

// Read on every listing and order, written rarely: a short cache.
const CACHE_MS = 30 * 1000;
const cache = new Map();

/** vertical -> Map(zoneId -> radiusKm), zones with no radius left out. */
export async function zoneRadiusMap(vertical) {
    const hit = cache.get(vertical);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.map;
    const rows = await DeliveryZoneRadius.find({ vertical, radiusKm: { $gt: 0 } }).select('zoneId radiusKm').lean();
    const map = new Map(rows.map((r) => [String(r.zoneId), Number(r.radiusKm)]));
    cache.set(vertical, { at: Date.now(), map });
    return map;
}

/**
 * The verdict for one store and one customer point. `limitKm` null means the
 * zone has no radius. A store with no position cannot be measured, so it is
 * not cut off (the zone still applies).
 */
export function judgeStoreDistance(store, point, map) {
    const limitKm = store?.zoneId ? map.get(String(store.zoneId)) ?? null : null;
    if (!limitKm || !point) return { ok: true, limitKm, distanceKm: null };
    const at = storePoint(store);
    if (!at) return { ok: true, limitKm, distanceKm: null };
    const distanceKm = round2(haversineKm(at.lat, at.lng, Number(point.lat), Number(point.lng)));
    return { ok: distanceKm <= limitKm, limitKm, distanceKm };
}

/** Keep only the stores whose zone radius reaches the customer. */
export async function filterStoresByZoneRadius(vertical, stores = [], point) {
    if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return stores;
    const map = await zoneRadiusMap(vertical).catch(() => new Map());
    if (!map.size) return stores;
    return stores.filter((s) => judgeStoreDistance(s, point, map).ok);
}

/** Throws a customer-facing reason when the store does not reach the point. */
export async function assertStoreReachesPoint(vertical, store, point) {
    const map = await zoneRadiusMap(vertical).catch(() => new Map());
    const verdict = judgeStoreDistance(store, point, map);
    if (!verdict.ok) {
        throw new ZoneRadiusError(
            `${store?.restaurantName || 'This store'} delivers within ${verdict.limitKm} km, and this address is `
            + `${verdict.distanceKm} km away. Choose a store closer to you.`,
        );
    }
    return verdict;
}

/**
 * Ids of the Quick or Medical stores whose zone radius does not reach this
 * point, for listings to leave out with `_id: { $nin }`. Done as a list of ids
 * rather than a geo clause so it drops into any existing query or $geoNear
 * without a second geo predicate. Empty when no zone of this service has a
 * radius, or there is no point to measure from.
 */
export async function storesOutOfReach(vertical, point) {
    if (vertical === 'food') return [];
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const map = await zoneRadiusMap(vertical).catch(() => new Map());
    if (!map.size) return [];
    const [{ FoodRestaurant }, { MEDICAL_STORE_TYPE }] = await Promise.all([
        import('../../modules/quickCommerce/modules/food/restaurant/models/restaurant.model.js'),
        import('../../modules/quickCommerce/modules/food/shared/storeType.js'),
    ]);
    const stores = await FoodRestaurant.find({
        zoneId: { $in: [...map.keys()].map((id) => new mongoose.Types.ObjectId(id)) },
        storeType: vertical === 'medical' ? MEDICAL_STORE_TYPE : { $ne: MEDICAL_STORE_TYPE },
    }).select('zoneId location latitude longitude').lean();
    return stores.filter((st) => !judgeStoreDistance(st, { lat, lng }, map).ok).map((st) => st._id);
}

/** Adds `_id $nin out-of-reach` to a Mongo filter without clobbering an `_id` already there. */
export function excludeIds(filter, ids = []) {
    if (!ids.length) return filter;
    const clause = { _id: { $nin: ids } };
    if (filter._id === undefined) return Object.assign(filter, clause);
    filter.$and = [...(filter.$and || []), clause];
    return filter;
}

async function zonesAndStores(vertical) {
    if (vertical === 'food') {
        const [{ FoodZone }, { FoodRestaurant }] = await Promise.all([
            import('../../modules/food/admin/models/zone.model.js'),
            import('../../modules/food/restaurant/models/restaurant.model.js'),
        ]);
        const zones = await FoodZone.find({}).select('name zoneName isActive').lean();
        const counts = await FoodRestaurant.aggregate([{ $group: { _id: '$zoneId', n: { $sum: 1 } } }]);
        return { zones, counts };
    }
    const [{ zoneModelFor }, { FoodRestaurant }, { MEDICAL_STORE_TYPE }] = await Promise.all([
        import('../../modules/quickCommerce/modules/food/shared/zoneServiceability.js'),
        import('../../modules/quickCommerce/modules/food/restaurant/models/restaurant.model.js'),
        import('../../modules/quickCommerce/modules/food/shared/storeType.js'),
    ]);
    const zones = await zoneModelFor(vertical).find({}).select('name zoneName isActive').lean();
    const match = vertical === 'medical' ? { storeType: MEDICAL_STORE_TYPE } : { storeType: { $ne: MEDICAL_STORE_TYPE } };
    const counts = await FoodRestaurant.aggregate([{ $match: match }, { $group: { _id: '$zoneId', n: { $sum: 1 } } }]);
    return { zones, counts };
}

/** For the Master page: every zone of a service, its radius and store count. */
export async function listZoneRadii(vertical) {
    if (!ZONE_RADIUS_VERTICALS.includes(vertical)) throw new ZoneRadiusError('Unknown service');
    const [{ zones, counts }, rows] = await Promise.all([
        zonesAndStores(vertical),
        DeliveryZoneRadius.find({ vertical }).lean(),
    ]);
    const byZone = new Map(rows.map((r) => [String(r.zoneId), r]));
    const countBy = new Map(counts.map((c) => [String(c._id), c.n]));
    return zones
        .map((z) => {
            const r = byZone.get(String(z._id));
            return {
                zoneId: String(z._id),
                name: z.name || z.zoneName || 'Unnamed zone',
                active: z.isActive !== false,
                stores: countBy.get(String(z._id)) || 0,
                radiusKm: r?.radiusKm ?? null,
                updatedAt: r?.updatedAt || null,
            };
        })
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

/**
 * Save a zone's radius. For food it is also written to every restaurant in
 * the zone (their own radius is what food enforces); blank clears them back to
 * the platform maximum. Returns how many restaurants were changed.
 */
export async function setZoneRadius(vertical, zoneId, value, { actor = 'admin' } = {}) {
    if (!ZONE_RADIUS_VERTICALS.includes(vertical)) throw new ZoneRadiusError('Unknown service');
    if (!mongoose.Types.ObjectId.isValid(String(zoneId || ''))) throw new ZoneRadiusError('Invalid zone');
    const verdict = validateZoneRadius(value);
    if (!verdict.ok) throw new ZoneRadiusError(verdict.reason);

    let restaurantsUpdated = 0;
    if (vertical === 'food') {
        const [{ FoodRestaurant }, radius] = await Promise.all([
            import('../../modules/food/restaurant/models/restaurant.model.js'),
            import('../../modules/food/restaurant/services/serviceRadius.service.js'),
        ]);
        const { maxRadiusKm } = await radius.loadServiceRadiusSettings();
        if (verdict.radiusKm !== null && verdict.radiusKm > maxRadiusKm) {
            throw new ZoneRadiusError(`The radius cannot be more than the ${maxRadiusKm} km maximum. Raise the maximum first.`);
        }
        if (verdict.radiusKm !== null && verdict.radiusKm < 1) {
            throw new ZoneRadiusError('A restaurant radius must be at least 1 km.');
        }
        const res = await FoodRestaurant.updateMany(
            { zoneId: new mongoose.Types.ObjectId(String(zoneId)), 'location.coordinates.1': { $exists: true } },
            { $set: { serviceRadiusKm: verdict.radiusKm, serviceRadiusUpdatedBy: actor, serviceRadiusUpdatedAt: new Date() } },
        );
        restaurantsUpdated = res.modifiedCount || 0;
        // The listing caches restaurants; a new radius must show now.
        await radius.clearServiceRadiusCaches().catch(() => {});
    }

    await DeliveryZoneRadius.findOneAndUpdate(
        { vertical, zoneId },
        { $set: { radiusKm: verdict.radiusKm, updatedBy: actor } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    cache.delete(vertical);
    return { radiusKm: verdict.radiusKm, restaurantsUpdated };
}
