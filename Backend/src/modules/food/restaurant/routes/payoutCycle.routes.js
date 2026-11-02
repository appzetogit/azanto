import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import { requireSuperAdmin } from '../../../../core/admin/requireSuperAdmin.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { getPayoutCycleOverview, savePayoutCycleSettings, runAutoWithdrawals, PayoutCycleError } from '../services/payoutCycle.service.js';

/** Restaurant payout cycle settings: /v1/food/admin/payout-cycle. Super admins only. */
const router = express.Router();
router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
});
router.use(authMiddleware, requireRoles('ADMIN'), requireSuperAdmin);

router.get('/', async (req, res) => {
    try {
        return sendResponse(res, 200, 'OK', await getPayoutCycleOverview());
    } catch (err) {
        return sendError(res, 500, 'Could not load the payout cycle.');
    }
});

router.put('/', async (req, res) => {
    try {
        return sendResponse(res, 200, 'Saved', await savePayoutCycleSettings(req.body || {}));
    } catch (err) {
        if (err instanceof PayoutCycleError) return sendError(res, 400, err.message);
        return sendError(res, 500, 'Could not save the payout cycle.');
    }
});

// Close the last cycle now instead of waiting for the night job. Same rules:
// a restaurant already filed for that cycle is not filed again.
router.post('/run', async (req, res) => {
    try {
        const s = await runAutoWithdrawals({ force: true });
        return sendResponse(res, 200, `Filed ${s.created.length} automatic withdrawal(s) for ${s.cycleLabel}`, s);
    } catch (err) {
        return sendError(res, 500, 'Could not run the payout cycle.');
    }
});

export default router;
