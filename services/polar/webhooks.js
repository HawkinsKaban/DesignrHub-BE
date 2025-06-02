const crypto = require('crypto');
require('dotenv').config(); // Untuk process.env.POLAR_WEBHOOK_SECRET

function verifyWebhookSignature(payload, signatureHeader) {
    try {
        const secret = process.env.POLAR_WEBHOOK_SECRET;
        if (!secret) {
            console.warn("[PolarWebhooks] ⚠️ POLAR_WEBHOOK_SECRET not set. Webhook signature verification will be skipped. THIS IS NOT RECOMMENDED FOR PRODUCTION.");
            return process.env.NODE_ENV !== 'production';
        }

        if (!signatureHeader) {
            console.warn("[PolarWebhooks] Webhook signature header ('Polar-Signature' or 'X-Polar-Signature') is missing.");
            return false;
        }
        
        const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const parts = signatureHeader.split(',');
        const signatureMap = {};
        parts.forEach(part => {
            const [key, value] = part.split('=');
            signatureMap[key.trim()] = value.trim(); 
        });

        const timestamp = signatureMap['t'];
        const providedSignature = signatureMap['v1'];

        if (!timestamp || !providedSignature) {
            console.warn("[PolarWebhooks] Webhook signature 't' (timestamp) or 'v1' (signature) part missing or malformed in header.");
            return false;
        }
        
        const signedPayload = `${timestamp}.${payloadString}`;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(signedPayload);
        const computedSignature = hmac.digest('hex');
        
        const providedSignatureBuffer = Buffer.from(providedSignature, 'hex');
        const computedSignatureBuffer = Buffer.from(computedSignature, 'hex');

        if (providedSignatureBuffer.length !== computedSignatureBuffer.length) {
            console.warn(`[PolarWebhooks] Webhook signature length mismatch. Provided: ${providedSignatureBuffer.length}, Computed: ${computedSignatureBuffer.length}`);
            return false;
        }
        
        const isValid = crypto.timingSafeEqual(providedSignatureBuffer, computedSignatureBuffer);
        
        if (!isValid) {
            console.warn(`[PolarWebhooks] Webhook signature mismatch. Provided: ${providedSignature}, Computed: ${computedSignature}`);
        } else {
            console.log("[PolarWebhooks] ✅ Webhook signature verified successfully.");
        }
        return isValid;

    } catch (error) {
        console.error("[PolarWebhooks] ❌ Webhook signature verification error:", error.message);
        return false;
    }
}

module.exports = {
    verifyWebhookSignature
};