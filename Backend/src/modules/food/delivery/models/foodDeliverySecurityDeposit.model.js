import mongoose from 'mongoose';

/*
 * A rider's refundable SECURITY DEPOSIT — the rider's own money, paid in once so
 * the platform is covered for the cash they will carry. Distinct from
 * food_delivery_cash_deposits, which is COD cash the rider collected and is
 * settling back; this is money the rider adds from their pocket and that the
 * admin-set `deliverySecurityDeposit` requires before they may be offered orders.
 *
 * The locked portion (min(sum of Completed deposits, required amount)) can never
 * be withdrawn; anything above it is withdrawable like normal earnings. See
 * core/finance/riderFinance.service.js, which reads this collection.
 */
const foodDeliverySecurityDepositSchema = new mongoose.Schema({
    deliveryPartnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodDeliveryPartner',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'razorpay', 'upi', 'bank_transfer'],
        default: 'razorpay'
    },
    status: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending',
        index: true
    },
    razorpayOrderId: {
        type: String,
        default: ''
    },
    razorpayPaymentId: String,
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    adminNote: String
}, {
    collection: 'food_delivery_security_deposits',
    timestamps: true
});

foodDeliverySecurityDepositSchema.index({ createdAt: -1 });

/*
 * One Razorpay payment is recorded once — same concurrency guard as the cash
 * deposit model: the upsert in verifyDeliverySecurityDepositPayment relies on
 * this unique index to hold under parallel verifications of one payment.
 * Partial, so rows without a payment id (e.g. admin-recorded) are not constrained.
 */
foodDeliverySecurityDepositSchema.index(
    { razorpayPaymentId: 1 },
    { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } }
);

export const FoodDeliverySecurityDeposit = mongoose.model(
    'FoodDeliverySecurityDeposit',
    foodDeliverySecurityDepositSchema
);
