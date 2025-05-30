// services/polar/discounts.js
const client = require('./client');

function mapVoucherToPolarDiscountPayload(voucherData, existingPolarDiscount = null) {
    const payload = {
        name: voucherData.name,
        code: voucherData.code,
        start_date: voucherData.startDate ? new Date(voucherData.startDate).toISOString().split('T')[0] : undefined,
        end_date: voucherData.endDate ? new Date(voucherData.endDate).toISOString().split('T')[0] : undefined,
        usage_limit: voucherData.usageLimit != null ? parseInt(voucherData.usageLimit) : null,
        metadata: {
            ...(existingPolarDiscount?.metadata || {}), 
            voucher_id_internal: voucherData._id.toString(),
            platform_internal: 'designrhub',
            status_internal: voucherData.status,
            discount_type_internal: voucherData.discountType,
            discount_value_internal: voucherData.discount,
            minimum_purchase_amount_internal: voucherData.minimumPurchaseAmount || 0,
            // FIX A: Convert array to comma-separated string
            package_ids_internal: voucherData.packageId?.map(id => id.toString()).join(',') || '', 
            times_used_internal: voucherData.timesUsed || 0,
            updated_at_internal: new Date().toISOString()
        }
    };

    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
    Object.keys(payload.metadata).forEach(key => {
        if (payload.metadata[key] === undefined || payload.metadata[key] === null) {
            delete payload.metadata[key];
        }
    });


    if (voucherData.discountType === 'fixed') {
        const discountUSD = parseFloat(voucherData.discount);
        if (isNaN(discountUSD) || discountUSD <= 0) {
            throw new Error('Invalid fixed discount value for Polar. Must be a positive number.');
        }
        payload.type = "fixed";
        // FIX B: Use 'amount' as per SDK error, instead of 'amount_off'
        payload.amount = Math.round(discountUSD * 100); // Amount in cents
        payload.currency = "USD"; 
    } else if (voucherData.discountType === 'percentage') {
        const discountPercentage = parseFloat(voucherData.discount);
        if (isNaN(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
            throw new Error('Invalid percentage discount value for Polar. Must be > 0 and <= 100.');
        }
        payload.type = "percentage";
        payload.basis_points = Math.round(discountPercentage * 100); 
    } else {
        throw new Error(`Unsupported discount type for Polar: ${voucherData.discountType}`);
    }

    payload.duration = voucherData.polarDurationType || 'once'; 
    if (payload.duration === 'repeating') {
        if (!voucherData.polarDurationInMonths || parseInt(voucherData.polarDurationInMonths, 10) <= 0) {
            throw new Error("For 'repeating' duration, 'polarDurationInMonths' is required and must be a positive integer for Polar.");
        }
        payload.duration_in_months = parseInt(voucherData.polarDurationInMonths, 10);
    } else {
        delete payload.duration_in_months;
    }
    
    return payload;
}


async function createDiscount(voucherData) {
    try {
        console.log(`[PolarDiscounts] Creating Polar discount for voucher: ${voucherData.name} (Code: ${voucherData.code})`);
        const discountPayload = mapVoucherToPolarDiscountPayload(voucherData);
        
        console.log("[PolarDiscounts] Sending discount data to Polar:", JSON.stringify(discountPayload, null, 2));
        const response = await client.discounts.create(discountPayload);
        console.log(`[PolarDiscounts] ✅ Polar discount created: ${response.id}`);
        return response;
    } catch (error) {
        console.error("[PolarDiscounts] ❌ Error creating Polar discount:", error.message);
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const detail = error.response.data.detail;
            const validationErrors = error.response.data.validation_errors;
             if (detail) errorMessage = detail;
            if (validationErrors) {
                const formattedValidationErrors = validationErrors.map(err => ({ ...err, path: err.path?.join('.') }));
                errorMessage += ` Validation Errors: ${JSON.stringify(formattedValidationErrors)}`;
            }
        }
        throw new Error(`Failed to create discount in Polar: ${errorMessage}`);
    }
}

async function updateDiscount(polarDiscountId, voucherData) {
     try {
        console.log(`[PolarDiscounts] Updating Polar discount ID: ${polarDiscountId} for voucher: ${voucherData.name}`);
        const existingPolarDiscount = await client.discounts.get(polarDiscountId);
        if (!existingPolarDiscount) {
            throw new Error(`Polar discount with ID ${polarDiscountId} not found for update.`);
        }
        
        const payloadToUpdate = mapVoucherToPolarDiscountPayload(voucherData, existingPolarDiscount);
        
        // Fields like 'code' and 'type' usually cannot be updated.
        // Remove them from payloadToUpdate if Polar API doesn't allow their update.
        delete payloadToUpdate.code; 
        delete payloadToUpdate.type; 
        // Also, 'duration' and 'duration_in_months' might be immutable for existing discounts,
        // or might require specific handling (e.g., creating a new discount).
        // For now, we'll attempt to send them, adjust if Polar API errors.
        
        console.log(`[PolarDiscounts] Sending discount update data to Polar (Discount ID: ${polarDiscountId}):`, JSON.stringify(payloadToUpdate, null, 2));
        const response = await client.discounts.update(polarDiscountId, payloadToUpdate);
        console.log(`[PolarDiscounts] ✅ Polar discount updated: ${response.id}`);
        return response;
    } catch (error) {
        console.error(`[PolarDiscounts] ❌ Error updating Polar discount ID ${polarDiscountId}:`, error.message);
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            console.error("[PolarDiscounts] Polar Error Details:", JSON.stringify(error.response.data, null, 2));
            const detail = error.response.data.detail;
            const validationErrors = error.response.data.validation_errors;
            if (detail) errorMessage = detail;
            if (validationErrors) {
                const formattedValidationErrors = validationErrors.map(err => ({ ...err, path: err.path?.join('.') }));
                errorMessage += ` Validation Errors: ${JSON.stringify(formattedValidationErrors)}`;
            }
        }
        throw new Error(`Failed to update discount in Polar: ${errorMessage}`);
    }
}

async function archiveDiscount(polarDiscountId) {
    try {
        console.log(`[PolarDiscounts] Archiving Polar discount ID: ${polarDiscountId}`);
        const response = await client.discounts.archive(polarDiscountId);
        console.log(`[PolarDiscounts] ✅ Polar discount archived: ${polarDiscountId}`);
        return response;
    } catch (error) {
        console.error(`[PolarDiscounts] ❌ Error archiving Polar discount ${polarDiscountId}:`, error.message);
        if (error.response && error.response.data) {
            const errorDetail = error.response.data.detail || JSON.stringify(error.response.data);
             console.error("[PolarDiscounts] Polar Error Details:", errorDetail);
            if (error.response.status === 404 || (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('not found')) || (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('archived'))) {
                console.warn(`[PolarDiscounts] Discount ${polarDiscountId} already archived or not found in Polar.`);
                return { id: polarDiscountId, is_archived: true, message: "Already archived or not found" };
            }
        }
        throw new Error(`Failed to archive discount in Polar: ${error.response?.data?.detail || error.message}`);
    }
}

module.exports = {
    createDiscount,
    updateDiscount,
    archiveDiscount
};