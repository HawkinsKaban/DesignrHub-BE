const client = require('./client'); // Ekspor klien juga jika diperlukan di tempat lain secara langsung
const customerFunctions = require('./customers');
const productFunctions = require('./products');
const checkoutFunctions = require('./checkouts');
const orderFunctions = require('./orders');
const discountFunctions = require('./discounts');
const subscriptionFunctions = require('./subscriptions');
const webhookFunctions = require('./webhooks');

module.exports = {
    client, // Instance klien Polar
    ...customerFunctions,
    ...productFunctions,
    ...checkoutFunctions,
    ...orderFunctions,
    ...discountFunctions,
    ...subscriptionFunctions,
    ...webhookFunctions
};