import mongoose from 'mongoose';

const deliveryCashLimitSchema = new mongoose.Schema(
    {
        deliveryCashLimit: { type: Number, default: 0, min: 0 },
        deliveryWithdrawalLimit: { type: Number, default: 100, min: 0 },
        /*
         * Refundable security deposit a delivery rider must pay in (from their own
         * pocket, via Razorpay) before being offered food / quick-commerce orders.
         * 0 means the feature is OFF: no rider is gated and nothing is locked, so
         * existing behaviour is unchanged until an admin sets a positive amount.
         */
        deliverySecurityDeposit: { type: Number, default: 0, min: 0 },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_delivery_cash_limits', timestamps: true }
);

deliveryCashLimitSchema.index({ isActive: 1, createdAt: -1 });

export const FoodDeliveryCashLimit = mongoose.model('FoodDeliveryCashLimit', deliveryCashLimitSchema);

