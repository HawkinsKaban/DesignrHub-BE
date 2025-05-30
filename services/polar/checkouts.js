// services/polar/checkouts.js
const client = require('./client');

async function createCheckout(checkoutData) {
    try {
        if (!checkoutData.line_items || checkoutData.line_items.length === 0 || !checkoutData.line_items[0].price_id) {
             throw new Error("Checkout creation requires at least one line_item with a valid price_id.");
        }
        if (!checkoutData.success_url) {
            throw new Error("success_url is required for Polar checkout session.");
        }
        // cancel_url juga sangat direkomendasikan
        if (!checkoutData.cancel_url) {
            console.warn("[PolarCheckouts] cancel_url is highly recommended for Polar checkout session.");
        }

        // Pastikan customer_email ada atau customer_id jika customer sudah ada di Polar
        if (!checkoutData.customer_email && !checkoutData.customer_id) {
            // Jika Anda menggunakan external_id untuk customer, Polar SDK mungkin akan mencarinya.
            // Atau, Anda bisa mengambil customer_id dari Polar terlebih dahulu.
            // Untuk kesederhanaan, kita asumsikan email selalu ada atau customer_id sudah di-resolve.
            console.warn("[PolarCheckouts] customer_email or customer_id should be provided for checkout.");
        }


        // Set default expiry jika tidak ada (misal 30 menit atau 1 jam dari sekarang)
        if (!checkoutData.expires_at) {
            checkoutData.expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 jam
        }

        console.log("[PolarCheckouts] Creating Polar checkout session with data:", JSON.stringify(checkoutData, null, 2));
        // Polar SDK mungkin menggunakan 'line_items' bukan 'lineItems'
        // Sesuaikan dengan nama parameter yang benar di SDK @polar-sh/sdk
        // Dari API reference sebelumnya, tampaknya `products` (array of string product IDs/price IDs) atau `line_items`.
        // Jika `line_items` digunakan, formatnya adalah:
        // line_items: [{ price: "price_xxxx", quantity: 1 }] atau [{ price_id: "price_xxxx", quantity: 1 }]
        // Pastikan ini sesuai dengan yang diharapkan oleh `client.checkouts.create()`
        
        const payloadForPolar = {
            success_url: checkoutData.success_url,
            cancel_url: checkoutData.cancel_url,
            line_items: checkoutData.line_items, // Pastikan format ini benar
            ...(checkoutData.customer_email && { customer_email: checkoutData.customer_email }),
            ...(checkoutData.customer_id && { customer_id: checkoutData.customer_id }),
            ...(checkoutData.metadata && { metadata: checkoutData.metadata }),
            ...(checkoutData.discounts && checkoutData.discounts.length > 0 && { discounts: checkoutData.discounts }),
            ...(checkoutData.expires_at && { expires_at: checkoutData.expires_at }),
            // Tambahkan field lain yang didukung Polar seperti 'allow_discount_codes', 'billing_address_collection' dll jika perlu
        };


        const response = await client.checkouts.create(payloadForPolar);
        console.log(`[PolarCheckouts] ✅ Polar checkout session created: ${response.id}, URL: ${response.url}`);
        return response;
    } catch (error) {
        console.error("[PolarCheckouts] ❌ Error creating Polar checkout session:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCheckouts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        const polarErrorDetail = error.response?.data?.detail || error.response?.data?.message || error.message;
        throw new Error(`Failed to create checkout session in Polar: ${polarErrorDetail}`);
    }
}

async function getCheckout(checkoutId) {
    try {
        console.log(`[PolarCheckouts] Getting Polar checkout session by ID: ${checkoutId}`);
        const checkoutSession = await client.checkouts.get(checkoutId);
        console.log(`[PolarCheckouts] ✅ Retrieved Polar checkout session: ${checkoutSession.id}`);
        return checkoutSession;
    } catch (error) {
        console.error(`[PolarCheckouts] ❌ Error getting Polar checkout session ${checkoutId}:`, error.message);
        if (error.response && error.response.data) {
            console.error("[PolarCheckouts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
        }
        const polarErrorDetail = error.response?.data?.detail || error.response?.data?.message || error.message;
        throw new Error(`Failed to get checkout session from Polar: ${polarErrorDetail}`);
    }
}

module.exports = {
    createCheckout,
    getCheckout
};