import express from 'express';
import { authMiddleware } from '../auth/auth.middleware.js';
import { requireRoles } from '../roles/role.middleware.js';
import { requireSuperAdmin } from '../admin/requireSuperAdmin.js';
import { sendResponse, sendError } from '../../utils/response.js';
import { listZoneRadii, setZoneRadius, ZoneRadiusError, ZONE_RADIUS_VERTICALS } from './zoneRadius.js';

/**
 * Master > Delivery Radius, zone by zone: /v1/platform/delivery-radius/zones.
 * Every zone of every service, so super admins only.
 */
const router = express.Router();
router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
});
router.use(authMiddleware, requireRoles('ADMIN'), requireSuperAdmin);

const verticalOf = (v) => (ZONE_RADIUS_VERTICALS.includes(String(v)) ? String(v) : null);

router.get('/', async (req, res) => {
    const vertical = verticalOf(req.query.vertical || 'food');
    if (!vertical) return sendError(res, 400, 'Choose Food, Quick or Medical');
    try {
        return sendResponse(res, 200, 'OK', { vertical, zones: await listZoneRadii(vertical) });
    } catch (err) {
        return sendError(res, 500, 'Could not load zones. Please try again.');
    }
});

router.put('/:vertical/:zoneId', async (req, res) => {
    const vertical = verticalOf(req.params.vertical);
    if (!vertical) return sendError(res, 400, 'Choose Food, Quick or Medical');
    try {
        const data = await setZoneRadius(vertical, req.params.zoneId, req.body?.radiusKm, { actor: 'admin' });
        return sendResponse(res, 200, 'Delivery radius saved', data);
    } catch (err) {
        if (err instanceof ZoneRadiusError) return sendError(res, 400, err.message);
        return sendError(res, 500, 'Could not save the radius. Please try again.');
    }
});

export default router;
