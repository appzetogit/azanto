/**
 * The complete bill of one taxi ride or parcel, for Taxi admin > Trip Requests.
 *
 * What the customer was charged, line by line, and how it divides between the
 * driver and Quickdrops. Built from the ride itself:
 *
 *   trip fare (the driver's)  = fare before surge - platform charges
 *   platform charges          = service tax + platform fee + GST on the fee
 *                               + rounding, fixed at booking
 *                               (pricingSnapshot.platform_charges_amount)
 *   customer pays             = ride.fare (includes surge, waiting, insurance
 *                               and any cancellation fee carried from an
 *                               earlier ride; less a promo)
 *
 * Drivers pay no commission; what they get is the trip fare plus surge and
 * waiting time (driver/services/walletService.js). Rides booked before the
 * platform charges were recorded (before 29 Oct 2026) have no split: their
 * lines are left null and `chargesRecorded` is false, rather than guessed.
 */

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const orNull = (v) => (v === null || v === undefined ? null : money(v));

const PAYMENT_LABELS = { cash: 'Cash', online: 'Online', wallet: 'Wallet', upi: 'UPI', card: 'Card' };

export function paymentLabel(ride) {
    const collection = ride?.driverPaymentCollection;
    if (collection?.status === 'paid' || collection?.paidAt) return 'UPI QR';
    const method = String(ride?.paymentMethod || 'cash').trim().toLowerCase();
    return PAYMENT_LABELS[method] || method.toUpperCase() || 'Cash';
}

export function buildTripBill(ride) {
    const snap = ride?.pricingSnapshot || {};
    const fare = money(ride?.fare);
    const charges = snap.platform_charges_amount;
    const chargesRecorded = charges !== null && charges !== undefined;

    const surge = money(snap.ride_surge_amount);
    const waiting = money(ride?.waitingChargeAmount);
    const insurance = money(ride?.insurance_fee);
    const previousCancellation = money(ride?.recovered_cancellation_due);
    const promo = money(snap.promo_discount_applied ?? ride?.promo?.discount_amount);
    const tip = money(ride?.feedback?.tipAmount);

    const serviceTax = chargesRecorded ? money(snap.service_tax_amount) : null;
    const platformFee = chargesRecorded ? money(snap.platform_fee_amount) : null;
    const platformFeeGst = chargesRecorded ? money(snap.platform_fee_gst_amount) : null;
    const rounding = chargesRecorded ? money(Number(charges) - serviceTax - platformFee - platformFeeGst) : null;
    const tripFare = chargesRecorded
        ? money(Math.max(0, Number(snap.fare_before_surge ?? fare) - Number(charges)))
        : null;

    const settled = Boolean(ride?.driverEarningsCreditedAt) || ride?.status === 'completed';
    // Settled figures when the ride has them; for a ride still running, what
    // it will settle at.
    const driverEarnings = settled && ride?.driverEarnings !== undefined
        ? money(ride.driverEarnings)
        : money(fare - (chargesRecorded ? Number(charges) : 0) - insurance - previousCancellation + promo);
    const incentive = money(ride?.driverIncentiveAmount);
    // What the driver gets for the trip itself: earnings less the tip (paid by
    // the customer on top) and any platform incentive.
    const driverTripShare = money(driverEarnings - tip - incentive);
    const quickdropsKeeps = money(fare - driverTripShare);

    return {
        chargesRecorded,
        lines: {
            tripFare,
            surge,
            waiting,
            serviceTax,
            platformFee,
            platformFeeGst,
            rounding,
            insurance,
            previousCancellation,
            promo,
        },
        customerPays: fare,
        tip,
        paymentMethod: paymentLabel(ride),
        split: {
            settled,
            driverTripShare,
            tip,
            incentive,
            driverTotal: driverEarnings,
            commission: money(ride?.commissionAmount),
            quickdropsKeeps,
            // Owed on to the government out of what Quickdrops keeps.
            taxesToGovernment: chargesRecorded ? money(serviceTax + platformFeeGst) : null,
        },
    };
}
