const client = require('./client');

async function getOrder(orderId) {
    try {
        console.log(`[PolarOrders] Getting Polar order by ID: ${orderId}`);
        return await client.orders.get(orderId);
    } catch (error) {
        console.error("[PolarOrders] ❌ Error getting Polar order:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarOrders] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to get order from Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

module.exports = {
    getOrder
};