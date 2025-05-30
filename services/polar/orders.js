// services/polar/orders.js
const client = require('./client');

async function getOrder(orderId) {
    try {
        console.log(`[PolarOrders] Getting Polar order by ID: ${orderId}`);
        const order = await client.orders.get(orderId); // Pastikan SDK memiliki client.orders.get
        console.log(`[PolarOrders] ✅ Retrieved Polar order: ${order.id}`);
        return order;
    } catch (error) {
        console.error(`[PolarOrders] ❌ Error getting Polar order ${orderId}:`, error.message);
        if (error.response && error.response.data) {
            console.error("[PolarOrders] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        const polarErrorDetail = error.response?.data?.detail || error.response?.data?.message || error.message;
        throw new Error(`Failed to get order from Polar: ${polarErrorDetail}`);
    }
}

module.exports = {
    getOrder
};