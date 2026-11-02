/**
 * What the driver earns on a ride, before it is settled -- for the offer card
 * ("You earn 30 · Customer pays 37") and the ride screens.
 *
 * The fare the rider pays less the platform's charges (service tax, the
 * customer platform fee and GST on it), fixed at booking in
 * pricingSnapshot.platform_charges_amount. Drivers pay no commission, so that
 * is the whole of it; the settlement (driver/services/walletService.js) works
 * the final figure the same way and adds waiting time, tips and incentives.
 * A ride booked before the charges were recorded shows the fare, which is
 * what it settles at.
 */
export function estimateDriverEarning(ride) {
    const fare = Math.max(0, Number(ride?.fare) || 0);
    const charges = Math.max(0, Number(ride?.pricingSnapshot?.platform_charges_amount) || 0);
    return Math.round(Math.max(0, fare - Math.min(charges, fare)) * 100) / 100;
}
