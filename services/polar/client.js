const { Polar } = require('@polar-sh/sdk');
require('dotenv').config(); // Pastikan variabel environment dimuat

console.log('Initializing Polar client...');
console.log(`POLAR_ACCESS_TOKEN exists: ${!!process.env.POLAR_ACCESS_TOKEN}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

let polarClientInstance;

try {
    if (!process.env.POLAR_ACCESS_TOKEN) {
        throw new Error('POLAR_ACCESS_TOKEN is not set in environment variables.');
    }
    polarClientInstance = new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN,
        server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
    });
    console.log('✅ Polar client initialized successfully for environment:', process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
} catch (error) {
    console.error('❌ Failed to initialize Polar client:', error.message);
    // Fallback dummy client
    polarClientInstance = {
        customers: {
            create: async (data) => { console.warn("Dummy Polar: customers.create called", data); return ({ id: `dummy-customer-${Date.now()}`, email: data.email }); },
            get: async (id) => { console.warn("Dummy Polar: customers.get called", id); return ({ id }); },
            list: async (params) => { console.warn("Dummy Polar: customers.list called", params); return ({ items: [], pagination: { total_count: 0, max_page: 1 } }); }
        },
        products: {
            create: async (data) => {
                console.warn("Dummy Polar: products.create called", data);
                const priceId = `dummy-price-${Date.now()}`;
                return ({
                    id: `dummy-product-${Date.now()}`,
                    name: data.name,
                    prices: data.prices ? data.prices.map(p => ({ 
                        id: priceId,
                        product_id: `dummy-product-${Date.now()}`,
                        price_amount: p.price_amount,
                        price_currency: p.price_currency,
                        type: p.type,
                        recurring_interval: p.recurring_interval,
                        amountType: p.price_amount > 0 ? 'fixed' : 'free' 
                    })) : [],
                });
            },
            update: async (id, data) => { console.warn("Dummy Polar: products.update called", id, data); return ({ id, name: data.name }); },
            get: async (id) => { console.warn("Dummy Polar: products.get called", id); return ({ id, prices: [{id: `dummy-price-for-${id}`, price_amount: 1000, price_currency: 'USD', type: 'recurring', recurring_interval: 'month', amountType: 'fixed'}] }); },
            archive: async (id) => { console.warn("Dummy Polar: products.archive called", id); return ({ id, isArchived: true }); }
        },
        prices: {
             create: async (data) => {
                console.warn("Dummy Polar: prices.create called", data);
                return ({
                    id: `dummy-price-${Date.now()}`,
                    product_id: data.product_id,
                    price_amount: data.price_amount,
                    price_currency: data.price_currency,
                    type: data.type,
                    recurring_interval: data.recurring_interval,
                    amountType: data.price_amount > 0 ? 'fixed' : 'free'
                });
            },
            update: async (id, data) => { console.warn("Dummy Polar: prices.update called", id, data); return ({ id, price_amount: data.price_amount }); },
            archive: async (id) => { console.warn("Dummy Polar: prices.archive called", id); return ({ id, isArchived: true }); }
        },
        checkouts: {
            create: async (data) => { console.warn("Dummy Polar: checkouts.create called", data); return ({ id: `dummy-checkout-${Date.now()}`, url: `http://localhost/dummy-checkout/${Date.now()}`, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() }); },
            get: async (id) => { console.warn("Dummy Polar: checkouts.get called", id); return ({ id }); }
        },
        orders: {
            get: async (id) => { console.warn("Dummy Polar: orders.get called", id); return ({ id }); }
        },
        discounts: {
            create: async (data) => { console.warn("Dummy Polar: discounts.create called", data); return ({ id: `dummy-discount-${Date.now()}` }); },
            update: async (id, data) => { console.warn("Dummy Polar: discounts.update called", id, data); return ({ id }); },
            archive: async (id) => { console.warn("Dummy Polar: discounts.archive called", id); return ({ id }); }
        },
        subscriptions: {
            get: async (id) => { console.warn("Dummy Polar: subscriptions.get called", id); return ({ id }); },
            cancel: async (id) => { console.warn("Dummy Polar: subscriptions.cancel called", id); return ({ id }); }
        }
    };
}

module.exports = polarClientInstance;