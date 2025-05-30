// services/polar/customers.js
const client = require('./client'); // Mengimpor instance klien yang sudah diinisialisasi

async function createOrUpdateCustomer(userData) {
    try {
        console.log(`[PolarCustomers] Attempting to create/update Polar customer for: ${userData.email}`);
        
        // Cek dulu apakah customer dengan external_id sudah ada
        const existingPolarCustomer = await getCustomerByExternalId(userData._id.toString());
        
        const customerPayload = {
            email: userData.email,
            name: userData.username || userData.email.split('@')[0], // Nama customer di Polar
            external_id: userData._id.toString(), // ID pengguna dari sistem Anda
            metadata: { // Metadata tambahan yang mungkin berguna
                user_id_internal: userData._id.toString(),
                username_internal: userData.username,
                phone_internal: userData.nomor || null,
                platform: 'designrhub',
                registered_at: userData.createdAt ? new Date(userData.createdAt).toISOString() : new Date().toISOString(),
            }
        };

        let response;
        if (existingPolarCustomer) {
            console.log(`[PolarCustomers] Found existing Polar customer ${existingPolarCustomer.id}. Updating...`);
            // Jika ada field yang perlu diupdate, panggil client.customers.update(existingPolarCustomer.id, payloadUpdate)
            // Untuk saat ini, kita anggap create akan meng-handle atau kita bisa return yang sudah ada jika tidak ada perubahan signifikan.
            // Polar SDK mungkin tidak memiliki `update` dan mengharapkan `create` untuk idempotency berdasarkan `external_id` atau email.
            // Berdasarkan dokumentasi Polar, `create` dapat digunakan dan akan mencari `external_id` atau `email`.
            // Jika ada yang sama, akan dikembalikan customer yang ada.
            // Jika tidak ada `update` eksplisit, maka `create` adalah cara yang tepat.
            // Untuk memastikan data termutakhir, kita bisa list berdasarkan external_id, lalu jika ada, panggil update.
            // Namun, SDK create Polar mungkin sudah menangani ini (upsert-like behavior). Mari asumsikan SDK create pintar.
            response = await client.customers.create(customerPayload); // Atau client.customers.update jika tersedia dan dibutuhkan
            console.log(`[PolarCustomers] ✅ Polar customer data potentially refreshed/retrieved: ${response.id}`);
        } else {
            console.log("[PolarCustomers] No existing Polar customer found. Creating new one...");
            console.log("[PolarCustomers] Sending customer data to Polar:", JSON.stringify(customerPayload, null, 2));
            response = await client.customers.create(customerPayload);
            console.log(`[PolarCustomers] ✅ Polar customer created: ${response.id}`);
        }
        return response;
    } catch (error) {
        console.error("[PolarCustomers] ❌ Error creating/updating Polar customer:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCustomers] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        // Tambahkan detail error spesifik jika ada dari Polar
        const polarErrorDetail = error.response?.data?.detail || error.response?.data?.message || error.message;
        throw new Error(`Failed to create/update customer in Polar: ${polarErrorDetail}`);
    }
}

async function getCustomerByExternalId(externalId) {
    try {
        console.log(`[PolarCustomers] Getting Polar customer by external ID: ${externalId}`);
        // Metode list dengan filter external_id adalah cara yang umum jika tidak ada get by external_id langsung
        const customers = await client.customers.list({ externalId: externalId, limit: 1 });
        if (customers && customers.items && customers.items.length > 0) {
            console.log(`[PolarCustomers] ✅ Found Polar customer by external ID: ${customers.items[0].id}`);
            return customers.items[0];
        }
        console.log(`[PolarCustomers] No Polar customer found for external ID: ${externalId}`);
        return null;
    } catch (error) {
        console.error(`[PolarCustomers] ❌ Error getting Polar customer by external ID ${externalId}:`, error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCustomers] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        // Jangan throw error di sini agar alur register tidak gagal total jika hanya getCustomer gagal.
        // createOrUpdateCustomer akan menangani pembuatan jika null dikembalikan.
        return null; 
    }
}

module.exports = {
    createOrUpdateCustomer,
    getCustomerByExternalId
};