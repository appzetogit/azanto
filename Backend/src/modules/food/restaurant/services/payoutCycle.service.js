/**
 * Restaurant payout cycles and the automatic withdrawal at the end of each.
 *
 * Cycles are calendar blocks of `cycleDays` (default 10) within a month, in
 * India time: with 10, 1-10, 11-20 and 21 to the month's end (a leftover of
 * under half a cycle joins the last block, so the 31st is never a cycle of
 * its own). Every restaurant
 * shares the same dates.
 *
 * On the first day of a cycle (the 11th, 21st and 1st with 10) the daily
 * maintenance job closes the previous one: for each approved restaurant with
 * money to withdraw it files a withdrawal request for its whole available
 * balance -- the same request a restaurant files from its app, under the same
 * lock and checks -- marked automatic and tagged with the cycle. The admin
 * still pays and approves or rejects each one; nothing is paid by itself.
 * Skipped: below the minimum withdrawal, nothing available, or a request
 * already waiting. Filing is once per restaurant per cycle (cycleKey), so a
 * re-run or a missed day changes nothing.
 */
import mongoose from 'mongoose';
import { logger } from '../../../../utils/logger.js';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
export const PAYOUT_CYCLE_LIMITS = Object.freeze({ MIN_DAYS: 1, MAX_DAYS: 31, DEFAULT_DAYS: 10 });

const settingsSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true },
        cycleDays: { type: Number, default: PAYOUT_CYCLE_LIMITS.DEFAULT_DAYS, min: 1, max: 31 },
        autoWithdrawal: { type: Boolean, default: true },
        lastRun: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { collection: 'food_restaurant_payout_cycle', timestamps: true },
);
export const FoodRestaurantPayoutCycle = mongoose.models.FoodRestaurantPayoutCycle
    || mongoose.model('FoodRestaurantPayoutCycle', settingsSchema, 'food_restaurant_payout_cycle');

export class PayoutCycleError extends Error {}

export async function loadPayoutCycleSettings() {
    const doc = await FoodRestaurantPayoutCycle.findOne({ key: 'default' }).lean();
    const days = Number(doc?.cycleDays);
    return {
        cycleDays: Number.isInteger(days) && days >= 1 && days <= 31 ? days : PAYOUT_CYCLE_LIMITS.DEFAULT_DAYS,
        autoWithdrawal: doc?.autoWithdrawal !== false,
        lastRun: doc?.lastRun || null,
    };
}

export async function savePayoutCycleSettings(body = {}) {
    const set = {};
    if (body.cycleDays !== undefined) {
        const days = Number(body.cycleDays);
        if (!Number.isInteger(days) || days < 1 || days > 31) {
            throw new PayoutCycleError('The payout cycle is a whole number of days, from 1 to 31.');
        }
        set.cycleDays = days;
    }
    if (body.autoWithdrawal !== undefined) set.autoWithdrawal = Boolean(body.autoWithdrawal);
    await FoodRestaurantPayoutCycle.findOneAndUpdate({ key: 'default' }, { $set: set }, { upsert: true, setDefaultsOnInsert: true });
    return describeSettings(await loadPayoutCycleSettings());
}

// ---- dates, all in India time ----

const istParts = (date) => {
    const d = new Date(date.getTime() + IST_OFFSET_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
};
const istMidnight = (y, m, day) => new Date(Date.UTC(y, m, day) - IST_OFFSET_MS);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The cycle containing `date`: { start, end (inclusive, last ms), key, label, startDay, endDay }. */
export function cycleContaining(date = new Date(), cycleDays = PAYOUT_CYCLE_LIMITS.DEFAULT_DAYS) {
    const n = Math.max(1, Math.min(31, Math.floor(cycleDays) || PAYOUT_CYCLE_LIMITS.DEFAULT_DAYS));
    const { y, m, day } = istParts(date);
    const last = daysInMonth(y, m);
    // A last block shorter than half a cycle is folded into the one before:
    // with 10 days, the 31st is part of 21-31 rather than a cycle of 1 day,
    // while February keeps 21-28.
    let fullBlocks = Math.ceil(last / n);
    if (fullBlocks > 1 && last - (fullBlocks - 1) * n < Math.ceil(n / 2)) fullBlocks -= 1;
    const index = Math.min(Math.floor((day - 1) / n), fullBlocks - 1);
    const startDay = index * n + 1;
    const endDay = index === fullBlocks - 1 ? last : startDay + n - 1;
    const start = istMidnight(y, m, startDay);
    const end = new Date(istMidnight(y, m, endDay + 1).getTime() - 1);
    return {
        start,
        end,
        startDay,
        endDay,
        key: `${y}-${String(m + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
        label: `${startDay}-${endDay} ${MONTHS[m]} ${y}`,
        startLabel: { day: String(startDay), month: MONTHS[m] },
        endLabel: { day: String(endDay), month: MONTHS[m] },
    };
}

export const previousCycle = (date = new Date(), cycleDays) =>
    cycleContaining(new Date(cycleContaining(date, cycleDays).start.getTime() - 1), cycleDays);

const describeSettings = (s, now = new Date()) => {
    const current = cycleContaining(now, s.cycleDays);
    return {
        ...s,
        currentCycle: { label: current.label, start: current.start, end: current.end },
        // The automatic run happens early on the day after the cycle ends.
        nextAutoWithdrawalOn: new Date(current.end.getTime() + 1),
    };
};

export async function getPayoutCycleOverview(now = new Date()) {
    return describeSettings(await loadPayoutCycleSettings(), now);
}

// ---- the automatic withdrawal ----

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * File the automatic withdrawals for the cycle that ended before `now`'s cycle.
 * Returns a summary; never throws for one restaurant's failure.
 */
export async function runAutoWithdrawals({ now = new Date(), force = false } = {}) {
    const settings = await loadPayoutCycleSettings();
    const cycle = previousCycle(now, settings.cycleDays);
    const summary = { cycleKey: cycle.key, cycleLabel: cycle.label, ranAt: now, created: [], skipped: 0, failed: 0, total: 0 };
    if (!settings.autoWithdrawal && !force) {
        summary.disabled = true;
        return summary;
    }
    // The night job closes a cycle in its first two days only (a missed night
    // is caught up the next). Later, nothing: when this went live on 29 Oct,
    // a run that night would otherwise have filed for 11-20 Oct, long closed.
    // The admin's "Run for last cycle" (force) is not limited.
    const current = cycleContaining(now, settings.cycleDays);
    if (!force && now.getTime() - current.start.getTime() >= 2 * 24 * 60 * 60 * 1000) {
        summary.notCycleStart = true;
        return summary;
    }

    const [{ FoodRestaurant }, { FoodRestaurantWithdrawal }, { getRestaurantFinance }, admin, lock] = await Promise.all([
        import('../models/restaurant.model.js'),
        import('../models/foodRestaurantWithdrawal.model.js'),
        import('./restaurantFinance.service.js'),
        import('../../admin/services/admin.service.js'),
        import('../../../../core/finance/financeLock.js').catch(() => null),
    ]);
    const { minimumWithdrawalAmount } = await admin.getRestaurantWithdrawalSettings();
    const minimum = Math.max(1, Number(minimumWithdrawalAmount) || 0);
    const restaurants = await FoodRestaurant.find({ status: 'approved' })
        .select('restaurantName accountNumber ifscCode accountHolderName bankName upiId')
        .lean();

    for (const r of restaurants) {
        const file = async () => {
            if (await FoodRestaurantWithdrawal.exists({ restaurantId: r._id, autoCycleKey: cycle.key })) return 'skip';
            if (await FoodRestaurantWithdrawal.exists({ restaurantId: r._id, status: 'pending' })) return 'skip';
            const finance = await getRestaurantFinance(String(r._id));
            const available = round2(finance?.currentCycle?.netAvailable ?? 0);
            if (!(available >= minimum)) return 'skip';
            const w = await FoodRestaurantWithdrawal.create({
                restaurantId: r._id,
                amount: available,
                status: 'pending',
                bankDetails: {
                    accountNumber: r.accountNumber || '',
                    ifscCode: r.ifscCode || '',
                    bankName: r.bankName || '',
                    accountHolderName: r.accountHolderName || '',
                },
                autoCreated: true,
                autoCycleKey: cycle.key,
                autoCycleLabel: cycle.label,
            });
            return { id: String(w._id), restaurantId: String(r._id), name: r.restaurantName || '', amount: available };
        };
        try {
            const result = lock?.withFinanceLock && lock?.restaurantWithdrawalLockKey
                ? await lock.withFinanceLock(lock.restaurantWithdrawalLockKey(String(r._id)), file)
                : await file();
            if (result === 'skip') summary.skipped += 1;
            else {
                summary.created.push(result);
                summary.total = round2(summary.total + result.amount);
            }
        } catch (err) {
            summary.failed += 1;
            logger.warn(`[payout-cycle] ${r.restaurantName || r._id}: ${err.message}`);
        }
    }

    await FoodRestaurantPayoutCycle.findOneAndUpdate(
        { key: 'default' },
        { $set: { lastRun: { ...summary, created: summary.created.length } } },
        { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => {});

    if (summary.created.length) {
        try {
            const { alertAdmins, ALERT_KINDS } = await import('../../../../core/notifications/adminAlerts.js');
            alertAdmins({
                kind: ALERT_KINDS.PAYOUT,
                module: 'food',
                title: `Automatic withdrawals for ${cycle.label}`,
                body: `${summary.created.length} restaurant${summary.created.length === 1 ? '' : 's'}, Rs ${summary.total.toLocaleString('en-IN')} to pay`,
                link: '/admin/food/restaurant-withdraws',
                refId: `payout-cycle-${cycle.key}`,
            });
        } catch (err) {
            logger.warn(`[payout-cycle] admin alert failed: ${err.message}`);
        }
        try {
            const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
            await Promise.all(summary.created.map((c) => notifyOwnerSafely(
                { ownerType: 'RESTAURANT', ownerId: c.restaurantId },
                {
                    title: 'Payout requested',
                    body: `Rs ${c.amount.toLocaleString('en-IN')} for ${cycle.label} has been sent for payout.`,
                    data: { type: 'restaurant_withdrawal_auto', withdrawalId: c.id },
                },
            ).catch(() => null)));
        } catch (err) {
            logger.warn(`[payout-cycle] restaurant notify failed: ${err.message}`);
        }
    }
    logger.info(`[payout-cycle] ${cycle.label}: ${summary.created.length} filed, Rs ${summary.total}, ${summary.skipped} skipped, ${summary.failed} failed`);
    return summary;
}
