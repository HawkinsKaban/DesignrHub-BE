const client = require('./client');

async function getSubscription(subscriptionId) {
    try {
        console.log(`[PolarSubscriptions] Getting Polar subscription by ID: ${subscriptionId}`);
        return await client.subscriptions.get(subscriptionId);
    } catch (error) {
        console.error("[PolarSubscriptions] ❌ Error getting Polar subscription:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarSubscriptions] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to get subscription from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function cancelSubscription(subscriptionId) {
    try {
        console.log(`[PolarSubscriptions] Cancelling Polar subscription ID: ${subscriptionId}`);
        const response = await client.subscriptions.cancel(subscriptionId);
        console.log(`[PolarSubscriptions] ✅ Polar subscription cancelled: ${subscriptionId}`);
        return response;
    } catch (error) {
        console.error("[PolarSubscriptions] ❌ Error cancelling Polar subscription:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarSubscriptions] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to cancel subscription in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

module.exports = {
    getSubscription,
    cancelSubscription
};