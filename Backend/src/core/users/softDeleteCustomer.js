import mongoose from 'mongoose';
import { logger } from '../../utils/logger.js';

/**
 * A customer deleting their own account: a SOFT delete.
 *
 * The record stays -- past orders, payments, refunds and wallet history keep
 * pointing at it for the platform's accounts -- but it is closed:
 *   - marked deletedAt / isActive:false (and taxi's `active:false`), so the
 *     auth middleware refuses its tokens on the next request;
 *   - its phone is set aside (phone unique), so the number can sign up again
 *     as a brand-new account with nothing carried over;
 *   - every login is revoked (Food refresh tokens), push tokens cleared.
 *
 * Plain $set on the raw collections: two schemas (Food and Taxi) share
 * `users`, and a full-document save through either can drop the other's fields.
 */
export async function softDeleteCustomer(userId, { reason = 'Deleted by the customer from the app' } = {}) {
    if (!mongoose.Types.ObjectId.isValid(String(userId))) return null;
    const _id = new mongoose.Types.ObjectId(String(userId));
    const db = mongoose.connection.db;
    const users = db.collection('users');
    const user = await users.findOne({ _id }, { projection: { phone: 1, deletedAt: 1 } });
    if (!user) return null;
    if (user.deletedAt) return { id: String(_id), deletedAt: user.deletedAt, alreadyDeleted: true };

    const now = new Date();
    const stamp = `#deleted-${now.getTime()}`;
    const phone = String(user.phone || '');
    await users.updateOne({ _id }, {
        $set: {
            deletedAt: now,
            isActive: false,
            active: false,
            deletionReason: String(reason).slice(0, 300),
            ...(phone && !phone.includes('#deleted-') ? { phone: `${phone}${stamp}`, deletedPhone: phone } : {}),
            fcmTokens: [],
            fcmTokenMobile: [],
        },
    });

    try {
        const { FoodRefreshToken } = await import('../refreshTokens/refreshToken.model.js');
        await FoodRefreshToken.deleteMany({ userId: _id });
    } catch (err) {
        logger.warn(`softDeleteCustomer: sign-out failed for ${_id}: ${err.message}`);
    }

    logger.info(`softDeleteCustomer: customer ${_id} deleted their account`);
    return { id: String(_id), deletedAt: now };
}
