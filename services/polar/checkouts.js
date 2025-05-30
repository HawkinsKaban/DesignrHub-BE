const client = require('./client');

async function createCheckout(checkoutData) {
    try {
        if (!checkoutData.lineItems || checkoutData.lineItems.length === 0 || !checkoutData.lineItems[0].price_id) {
             throw new Error("Checkout creation requires at least one line item with a valid price_id.");
        }
        console.log("[PolarCheckouts] Creating Polar checkout session with data:", JSON.stringify(checkoutData, null, 2));
        const response = await client.checkouts.create(checkoutData);
        console.log(`[PolarCheckouts] ✅ Polar checkout session created: ${response.id}, URL: ${response.url}`);
        return response;
    } catch (error) {
        console.error("[PolarCheckouts] ❌ Error creating Polar checkout session:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCheckouts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to create checkout session in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function getCheckout(checkoutId) {
    try {
        console.log(`[PolarCheckouts] Getting Polar checkout session by ID: ${checkoutId}`);
        return await client.checkouts.get(checkoutId);
    } catch (error) {
        console.error("[PolarCheckouts] ❌ Error getting Polar checkout session:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCheckouts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to get checkout session from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

module.exports = {
    createCheckout,
    getCheckout
};