const client = require('./client'); // Mengimpor instance klien yang sudah diinisialisasi

async function createOrUpdateCustomer(userData) {
    try {
        console.log(`[PolarCustomers] Creating/updating Polar customer for: ${userData.email}`);
        const customerData = {
            email: userData.email,
            name: userData.username || userData.email.split('@')[0],
            external_id: userData._id.toString(),
            metadata: {
                user_id: userData._id.toString(),
                registered_at: new Date().toISOString(),
                platform: 'designrhub'
            }
        };
        if (userData.nomor) customerData.metadata.phone = userData.nomor;
        console.log("[PolarCustomers] Sending customer data to Polar:", JSON.stringify(customerData, null, 2));
        const response = await client.customers.create(customerData);
        console.log(`[PolarCustomers] ✅ Polar customer created/retrieved: ${response.id}`);
        return response;
    } catch (error) {
        console.error("[PolarCustomers] ❌ Error creating/updating Polar customer:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCustomers] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Failed to create/update customer in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function getCustomerByExternalId(externalId) {
    try {
        console.log(`[PolarCustomers] Getting Polar customer by external ID: ${externalId}`);
        const customers = await client.customers.list({ external_id: externalId });
        if (customers && customers.items && customers.items.length > 0) {
            console.log(`[PolarCustomers] ✅ Found Polar customer by external ID: ${customers.items[0].id}`);
            return customers.items[0];
        }
        console.log(`[PolarCustomers] No Polar customer found for external ID: ${externalId}`);
        return null;
    } catch (error) {
        console.error("[PolarCustomers] ❌ Error getting Polar customer by external ID:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCustomers] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

module.exports = {
    createOrUpdateCustomer,
    getCustomerByExternalId
};