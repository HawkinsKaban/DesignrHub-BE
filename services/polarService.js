// Mengimpor semua fungsi yang telah dikumpulkan dari ./polar/index.js
const polarAPI = require('./polar');

// Kelas PolarService tetap ada untuk menjaga kompatibilitas dengan cara pemanggilan di controller Anda
class PolarService {
    constructor() {
        // Klien sudah diinisialisasi saat './polar/client' di-require oleh './polar/index.js'
        // Tidak perlu inisialisasi klien lagi di sini.
        // Jika Anda perlu akses langsung ke klien di metode kelas ini (meskipun sekarang tidak),
        // Anda bisa menyimpannya: this.client = polarAPI.client;
        // Namun, lebih baik jika fungsi-fungsi di modul polar/ yang langsung menggunakan klien dari polar/client.js
        console.log("PolarService class instantiated. Polar client should be ready via polarAPI modules.");
    }

    // Customers
    async createOrUpdateCustomer(userData) {
        return polarAPI.createOrUpdateCustomer(userData);
    }
    async getCustomerByExternalId(externalId) {
        return polarAPI.getCustomerByExternalId(externalId);
    }

    // Products
    async createProduct(packageData) {
        return polarAPI.createProduct(packageData);
    }
    async updateProduct(productId, packageData) {
        return polarAPI.updateProduct(productId, packageData);
    }
    async archiveProduct(productId) {
        return polarAPI.archiveProduct(productId);
    }
    async getProduct(productId) {
        return polarAPI.getProduct(productId);
    }

    // Checkouts
    async createCheckout(checkoutData) {
        return polarAPI.createCheckout(checkoutData);
    }
    async getCheckout(checkoutId) {
        return polarAPI.getCheckout(checkoutId);
    }

    // Orders
    async getOrder(orderId) {
        return polarAPI.getOrder(orderId);
    }

    // Discounts
    async createDiscount(voucherData) {
        return polarAPI.createDiscount(voucherData);
    }
    async updateDiscount(discountId, voucherData) {
        return polarAPI.updateDiscount(discountId, voucherData);
    }
    async archiveDiscount(discountId) {
        return polarAPI.archiveDiscount(discountId);
    }

    // Subscriptions
    async getSubscription(subscriptionId) {
        return polarAPI.getSubscription(subscriptionId);
    }
    async cancelSubscription(subscriptionId) {
        return polarAPI.cancelSubscription(subscriptionId);
    }

    // Webhooks
    verifyWebhookSignature(payload, signatureHeader) {
        return polarAPI.verifyWebhookSignature(payload, signatureHeader);
    }
}

// Instance tetap diekspor seperti sebelumnya
const polarServiceInstance = new PolarService();
module.exports = polarServiceInstance;