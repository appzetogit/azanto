import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import { requireSuperAdmin } from '../../../../core/admin/requireSuperAdmin.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { loadAdminCached } from '../../admin/middlewares/foodAdmin.middleware.js';
import { listRestaurantGst, setRestaurantGstPayout, setRestaurantGstin, gstTotals, GstPayoutError } from '../services/gstPayout.service.js';

/**
 * Master > Restaurant GST: /v1/food/admin/gst-payout. Decides money, so super
 * admins only; the restaurant app has no way to reach it.
 */
const router = express.Router();
router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
});
router.use(authMiddleware, requireRoles('ADMIN'), requireSuperAdmin);

const fail = (res, err, fallback) => (err instanceof GstPayoutError
    ? sendError(res, 400, err.message)
    : sendError(res, 500, fallback));

router.get('/restaurants', async (req, res) => {
    try {
        return sendResponse(res, 200, 'OK', { restaurants: await listRestaurantGst() });
    } catch (err) {
        return fail(res, err, 'Could not load restaurants. Please try again.');
    }
});

router.put('/restaurants/:id', async (req, res) => {
    try {
        const admin = await loadAdminCached(req.user?.userId || req.user?.id).catch(() => null);
        const actor = admin?.name || admin?.email || 'admin';
        const data = await setRestaurantGstPayout(req.params.id, req.body?.gstPayout, { actor });
        return sendResponse(res, 200, 'Saved', data);
    } catch (err) {
        return fail(res, err, 'Could not save. Please try again.');
    }
});

router.put('/restaurants/:id/gstin', async (req, res) => {
    try {
        const admin = await loadAdminCached(req.user?.userId || req.user?.id).catch(() => null);
        const actor = admin?.name || admin?.email || 'admin';
        return sendResponse(res, 200, 'Saved', await setRestaurantGstin(req.params.id, req.body?.gstin, { actor }));
    } catch (err) {
        return fail(res, err, 'Could not save the GSTIN. Please try again.');
    }
});

router.get('/totals', async (req, res) => {
    try {
        return sendResponse(res, 200, 'OK', await gstTotals({ from: req.query.from, to: req.query.to }));
    } catch (err) {
        return fail(res, err, 'Could not work out the GST totals. Please try again.');
    }
});

export default router;
