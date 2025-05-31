// controllers/packageControllers/updatePackage.js
const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel");
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.updatePackage = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;
        console.log(`[UpdatePackageCtrl] Attempting to update package ID: ${id}`);

        const existingPackage = await PackageModel.findById(id).session(session);
        if (!existingPackage) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[UpdatePackageCtrl] Package with ID ${id} not found.`);
            return res.status(404).json({ message: `Package with ID ${id} not found` });
        }

        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                 await session.abortTransaction(); session.endSession();
                 return res.status(400).json({ message: "Invalid Category ID format." });
            }
            const existingCategory = await CategoryModel.findById(categoryId).session(session);
            if (!existingCategory) {
                await session.abortTransaction();
                session.endSession();
                console.warn(`[UpdatePackageCtrl] Category with ID ${categoryId} not found.`);
                return res.status(400).json({ message: `Category with ID ${categoryId} not found` });
            }
            existingPackage.categoryId = existingCategory._id;
        } else if (categoryId === null || categoryId === '') { // Allow unsetting category
            existingPackage.categoryId = null;
        }

        if (packageName !== undefined) existingPackage.packageName = packageName;
        if (price !== undefined) {
            const parsedPrice = parseFloat(price);
            if (isNaN(parsedPrice) || parsedPrice < 0) {
                 await session.abortTransaction(); session.endSession();
                 return res.status(400).json({message: "Price must be a valid non-negative number."});
            }
            existingPackage.price = parsedPrice;
        }
        if (discountPrice !== undefined) {
             if (discountPrice === null || discountPrice === '') {
                existingPackage.discountPrice = null;
            } else {
                const parsedDiscountPrice = parseFloat(discountPrice);
                if (isNaN(parsedDiscountPrice) || parsedDiscountPrice < 0) {
                    await session.abortTransaction(); session.endSession();
                    return res.status(400).json({message: "Discount price must be a valid non-negative number or null."});
                }
                 if (existingPackage.price != null && parsedDiscountPrice > existingPackage.price) {
                    await session.abortTransaction(); session.endSession();
                    return res.status(400).json({ message: "Discount price cannot be greater than the original price." });
                }
                existingPackage.discountPrice = parsedDiscountPrice;
            }
        }

        if (durationName !== undefined) existingPackage.durationName = durationName;
        if (durationInDays !== undefined) existingPackage.durationInDays = parseInt(durationInDays);
        if (onDiscount !== undefined) existingPackage.onDiscount = onDiscount;
        if (endDiscountDate !== undefined) existingPackage.endDiscountDate = endDiscountDate ? new Date(endDiscountDate) : null;
        if (priority !== undefined) existingPackage.priority = parseInt(priority);

        const previousIsActive = existingPackage.isActive;
        if (isActive !== undefined) existingPackage.isActive = isActive;

        // Simpan perubahan lokal dulu sebelum sinkronisasi Polar, tapi masih dalam transaksi
        // await existingPackage.save({ session }); 
        // Sebaiknya save lokal dilakukan SETELAH operasi Polar berhasil atau SEBELUM jika operasi Polar hanya opsional
        // Untuk atomicity, kita akan save di akhir jika semua berhasil.

        let polarProduct = null;
        let polarAction = "none";
        let polarErrorOccurred = false;

        try {
            if (existingPackage.isActive) {
                if (existingPackage.polar_product_id) {
                    console.log(`[UpdatePackageCtrl] Updating existing Polar product ID: ${existingPackage.polar_product_id} for package ${existingPackage.packageName}.`);
                    polarProduct = await polarService.updateProduct(existingPackage.polar_product_id, existingPackage); // Pass existingPackage yang belum di-save dengan perubahan
                    polarAction = "updated";
                    console.log(`[UpdatePackageCtrl] ✅ Polar product ${existingPackage.polar_product_id} updated.`);
                } else {
                    console.log(`[UpdatePackageCtrl] Creating new Polar product for active package ${existingPackage.packageName} as it was not synced before.`);
                    polarProduct = await polarService.createProduct(existingPackage); // Pass existingPackage yang belum di-save
                    polarAction = "created";
                    console.log(`[UpdatePackageCtrl] ✅ New Polar product created: ${polarProduct.id} for package ${existingPackage.packageName}.`);
                }
                existingPackage.polar_product_id = polarProduct.id; // Update ID jika baru dibuat
                existingPackage.polar_metadata = polarProduct; 
            } else if (!existingPackage.isActive && previousIsActive && existingPackage.polar_product_id) {
                console.log(`[UpdatePackageCtrl] Archiving Polar product ID: ${existingPackage.polar_product_id} as package ${existingPackage.packageName} is now inactive.`);
                await polarService.archiveProduct(existingPackage.polar_product_id);
                polarAction = "archived";
                // Pertimbangkan untuk null-kan polar_product_id jika diarsipkan, atau biarkan untuk histori
                // existingPackage.polar_product_id = null; 
                // existingPackage.polar_metadata = {};
                console.log(`[UpdatePackageCtrl] ✅ Polar product ${existingPackage.polar_product_id} archived.`);
            }
        } catch (polarError) {
            polarErrorOccurred = true;
            console.error(`[UpdatePackageCtrl] ⚠️ Polar operation (${polarAction || 'unknown'}) failed for package ${existingPackage.packageName}: ${polarError.message}`);
            errorLogs(req, null, `Polar operation failed during package update for ${existingPackage.packageName}: ${polarError.message}`, "controllers/packageControllers/updatePackage.js (Polar Ops)");
            await session.abortTransaction();
            session.endSession();
            return res.status(500).json({
                message: `Package update failed due to an issue with payment gateway synchronization (${polarAction} action).`,
                error: `Polar service: ${polarError.message}`
            });
        }
        
        // Jika semua operasi Polar berhasil (atau tidak ada operasi Polar yang diperlukan), simpan perubahan lokal
        await existingPackage.save({ session });
        console.log(`[UpdatePackageCtrl] Package ${existingPackage.packageName} (ID: ${id}) changes committed to DB.`);

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "Package updated successfully!",
            package: existingPackage,
            polar_action: polarAction,
            polar_product_details: polarProduct // detail produk dari Polar jika ada operasi
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('[UpdatePackageCtrl] ❌ Server error during package update:', error);
        errorLogs(req, res, error.message, "controllers/packageControllers/updatePackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};