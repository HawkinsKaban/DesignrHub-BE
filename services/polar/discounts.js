const client = require('./client');

async function createDiscount(voucherData) {
    try {
        console.log(`[PolarDiscounts] Creating Polar discount for voucher: ${voucherData.name} (Code: ${voucherData.code})`);
        const discountPayloadBase = {
            name: voucherData.name,
            code: voucherData.code,
            startDate: new Date(voucherData.startDate).toISOString().split('T')[0], 
            endDate: new Date(voucherData.endDate).toISOString().split('T')[0],     
            metadata: {
                voucher_id_internal: voucherData._id.toString(),
                platform: 'designrhub',
                status_internal: voucherData.status,
            }
        };
        let discountPayload;
        if (voucherData.discountType === 'fixed') {
            const discountUSD = parseFloat(voucherData.discount);
            if (isNaN(discountUSD) || discountUSD <= 0) { 
                throw new Error('Invalid fixed discount value. Must be a positive number.');
            }
            discountPayload = { ...discountPayloadBase, type: "fixed", amountOff: Math.round(discountUSD * 100), currency: "USD" };
        } else { 
            const discountPercentage = parseFloat(voucherData.discount);
             if (isNaN(discountPercentage) || discountPercentage <=0 || discountPercentage > 100) {
                 throw new Error('Invalid percentage discount value. Must be > 0 and <= 100.');
            }
            discountPayload = { ...discountPayloadBase, type: "percentage", basisPoints: Math.round(discountPercentage * 100) };
        }
        const polarDuration = voucherData.polarDurationType || 'once'; 
        discountPayload.duration = polarDuration; 
        if (polarDuration === 'repeating') {
            if (!voucherData.polarDurationInMonths || parseInt(voucherData.polarDurationInMonths, 10) <= 0) {
                throw new Error("For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive integer.");
            }
            discountPayload.durationInMonths = parseInt(voucherData.polarDurationInMonths, 10);
        }
        console.log("[PolarDiscounts] Sending discount data to Polar:", JSON.stringify(discountPayload, null, 2));
        const response = await client.discounts.create(discountPayload);
        console.log(`[PolarDiscounts] ✅ Polar discount created: ${response.id}`);
        return response;
    } catch (error) {
        // ... (error handling sama)
        console.error("[PolarDiscounts] ❌ Error creating Polar discount:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const validationErrors = error.response.data.validation_errors;
            if (validationErrors) console.error("[PolarDiscounts] Validation Errors:", JSON.stringify(validationErrors, null, 2));
        }
        throw new Error(`Failed to create discount in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}

async function updateDiscount(discountId, voucherData) {
     try {
        console.log(`[PolarDiscounts] Updating Polar discount ID: ${discountId} for voucher: ${voucherData.name}`);
        const existingDiscount = await client.discounts.get(discountId);
        if (!existingDiscount) throw new Error(`Polar discount with ID ${discountId} not found for update.`);
        
        const discountPayloadBase = { /* ... (sama seperti di atas) ... */ };
        // ... (sisa logika updateDiscount sama)

        // CONTOH SINGKAT (lengkapi dengan logika penuh dari file asli Anda)
        const payloadToUpdate = { name: voucherData.name /* ... lengkapi sisanya ... */ };
         Object.keys(payloadToUpdate).forEach(key => payloadToUpdate[key] === undefined && delete payloadToUpdate[key]);

        console.log(`[PolarDiscounts] Sending discount update data to Polar (Discount ID: ${discountId}):`, JSON.stringify(payloadToUpdate, null, 2));
        const response = await client.discounts.update(discountId, payloadToUpdate);
        console.log(`[PolarDiscounts] ✅ Polar discount updated: ${response.id}`);
        return response;
    } catch (error) {
        // ... (error handling sama)
        console.error("[PolarDiscounts] ❌ Error updating Polar discount:", error.message);
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const validationErrors = error.response.data.validation_errors;
            if (validationErrors) console.error("[PolarDiscounts] Validation Errors:", JSON.stringify(validationErrors, null, 2));
        }
        throw new Error(`Failed to update discount in Polar: ${error.response?.data?.detail || error.response?.data?.message || error.message}`);
    }
}
async function archiveDiscount(discountId) {
    try {
        console.log(`[PolarDiscounts] Archiving Polar discount ID: ${discountId}`);
        const response = await client.discounts.archive(discountId);
        console.log(`[PolarDiscounts] ✅ Polar discount archived: ${discountId}`);
        return response;
    } catch (error) {
        // ... (error handling sama)
        console.error("[PolarDiscounts] ❌ Error archiving Polar discount:", error.message);
         if (error.response && (error.response.status === 404 || (error.response.data?.detail?.toLowerCase().includes('archived')))) {
            console.warn(`[PolarDiscounts] Discount ${discountId} already archived or not found.`);
            return { id: discountId, isArchived: true, message: "Already archived or not found" };
        }
        throw new Error(`Failed to archive discount in Polar: ${error.response?.data?.detail || error.message}`);
    }
}

module.exports = {
    createDiscount,
    updateDiscount,
    archiveDiscount
};