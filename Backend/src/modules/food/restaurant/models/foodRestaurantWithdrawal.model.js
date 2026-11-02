import mongoose from 'mongoose';

const foodRestaurantWithdrawalSchema = new mongoose.Schema({
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodRestaurant',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: [1, 'Minimum withdrawal amount is ₹1']
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },
    paymentMethod: {
        type: String,
        default: 'bank_transfer'
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        accountHolderName: String
    },
    adminNote: String,
    rejectionReason: String,
    transactionId: String, // Final bank transaction reference from admin
    processedAt: Date,
    // Filed by the payout cycle, not the restaurant (services/payoutCycle.service.js).
    autoCreated: { type: Boolean, default: false },
    autoCycleKey: { type: String, default: null },
    autoCycleLabel: { type: String, default: '' }
}, { 
    collection: 'food_restaurant_withdrawals', 
    timestamps: true 
});

foodRestaurantWithdrawalSchema.index({ createdAt: -1 });
// One automatic withdrawal per restaurant per cycle, whatever runs twice.
foodRestaurantWithdrawalSchema.index(
    { restaurantId: 1, autoCycleKey: 1 },
    { unique: true, partialFilterExpression: { autoCycleKey: { $type: 'string' } } }
);

/*
 * Tell the restaurant when the admin approves or rejects a withdrawal. The
 * admin's decision (admin.service updateWithdrawalStatus) is one
 * findOneAndUpdate setting status and processedAt; it sent nothing, so a
 * restaurant only found out by opening its payouts. Best-effort.
 */
foodRestaurantWithdrawalSchema.post('findOneAndUpdate', async function notifyDecision(doc) {
    try {
        const set = this.getUpdate()?.$set || {};
        if (!doc || !set.processedAt || !['approved', 'rejected'].includes(set.status)) return;
        const amount = `Rs ${Number(doc.amount || 0).toLocaleString('en-IN')}`;
        const approved = set.status === 'approved';
        const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnerSafely(
            { ownerType: 'RESTAURANT', ownerId: String(doc.restaurantId) },
            {
                title: approved ? 'Payout sent' : 'Payout rejected',
                body: approved
                    ? `${amount} has been paid to your bank${set.transactionId ? ` (ref ${set.transactionId})` : ''}.`
                    : `${amount} was not paid${set.rejectionReason ? `: ${set.rejectionReason}` : ''}. The amount is back in your balance.`,
                data: { type: approved ? 'restaurant_withdrawal_approved' : 'restaurant_withdrawal_rejected', withdrawalId: String(doc._id) },
            },
        );
    } catch {
        /* a notification must never undo the decision */
    }
});

export const FoodRestaurantWithdrawal = mongoose.model('FoodRestaurantWithdrawal', foodRestaurantWithdrawalSchema);
