const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel"); // typo: categoryModel
const polarService =require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.updatePackage = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        // Harga diasumsikan diterima dalam USD
        const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;
        console.log(`[UpdatePackage] Attempting to update package ID: ${id}`);

        const existingPackage = await PackageModel.findById(id).session(session);
        if (!existingPackage) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[UpdatePackage] Package with ID ${id} not found.`);
            return res.status(404).json({ message: `Package with ID ${id} not found` }); // Diubah menjadi 404
        }

        if (categoryId) {
            const existingCategory = await CategoryModel.findById(categoryId).session(session);
            if (!existingCategory) {
                await session.abortTransaction();
                session.endSession();
                console.warn(`[UpdatePackage] Category with ID ${categoryId} not found.`);
                return res.status(400).json({ message: `Category with ID ${categoryId} not found` });
            }
            existingPackage.categoryId = existingCategory._id;
        }


        // Validasi dan update field
        if (packageName !== undefined) existingPackage.packageName = packageName;
        if (price !== undefined) {
            const parsedPrice = parseFloat(price);
            if (isNaN(parsedPrice)) {
                 await session.abortTransaction(); session.endSession();
                 return res.status(400).json({message: "Price must be a number."});
            }
            existingPackage.price = parsedPrice; // Simpan harga USD
        }
        if (discountPrice !== undefined) { // Allow setting discountPrice to null
             if (discountPrice === null) {
                existingPackage.discountPrice = null;
            } else {
                const parsedDiscountPrice = parseFloat(discountPrice);
                if (isNaN(parsedDiscountPrice)) {
                    await session.abortTransaction(); session.endSession();
                    return res.status(400).json({message: "Discount price must be a number or null."});
                }
                existingPackage.discountPrice = parsedDiscountPrice; // Simpan harga diskon USD
            }
        }

        if (durationName !== undefined) existingPackage.durationName = durationName;
        if (durationInDays !== undefined) existingPackage.durationInDays = parseInt(durationInDays); // Pastikan integer
        if (onDiscount !== undefined) existingPackage.onDiscount = onDiscount;
        if (endDiscountDate !== undefined) existingPackage.endDiscountDate = endDiscountDate ? new Date(endDiscountDate) : null;
        if (priority !== undefined) existingPackage.priority = priority;

        const previousIsActive = existingPackage.isActive;
        if (isActive !== undefined) existingPackage.isActive = isActive;

        await existingPackage.save({ session });
        console.log(`[UpdatePackage] Package ${existingPackage.packageName} (ID: ${id}) updated in DB.`);

        let polarProduct = null;
        let polarAction = "none";

        if (existingPackage.isActive) {
            if (existingPackage.polar_product_id) {
                try {
                    console.log(`[UpdatePackage] Updating existing Polar product ID: ${existingPackage.polar_product_id} for package ${existingPackage.packageName}.`);
                    polarProduct = await polarService.updateProduct(existingPackage.polar_product_id, existingPackage);
                    existingPackage.polar_metadata = polarProduct; // Perbarui metadata dari respons Polar
                    await existingPackage.save({ session }); // Simpan metadata yang diperbarui
                    polarAction = "updated";
                    console.log(`[UpdatePackage] ✅ Polar product ${existingPackage.polar_product_id} updated.`);
                } catch (polarError) {
                    console.error(`[UpdatePackage] ⚠️ Failed to update Polar product ${existingPackage.polar_product_id}: ${polarError.message}`);
                    errorLogs(req, res, `Polar update failed for package ${existingPackage.packageName}: ${polarError.message}`, "controllers/packageControllers/updatePackage.js (Polar Update)");
                }
            } else {
                try {
                    console.log(`[UpdatePackage] Creating new Polar product for active package ${existingPackage.packageName} as it was not synced before.`);
                    polarProduct = await polarService.createProduct(existingPackage);
                    existingPackage.polar_product_id = polarProduct.id;
                    existingPackage.polar_metadata = polarProduct;
                    await existingPackage.save({ session });
                    polarAction = "created";
                    console.log(`[UpdatePackage] ✅ New Polar product created: ${polarProduct.id} for package ${existingPackage.packageName}.`);
                } catch (polarError) {
                    console.error(`[UpdatePackage] ⚠️ Failed to create new Polar product for ${existingPackage.packageName}: ${polarError.message}`);
                     errorLogs(req, res, `Polar creation failed for package ${existingPackage.packageName}: ${polarError.message}`, "controllers/packageControllers/updatePackage.js (Polar Create)");
                }
            }
        } else if (!existingPackage.isActive && previousIsActive && existingPackage.polar_product_id) {
            // Jika paket dinonaktifkan dan sebelumnya aktif serta memiliki ID Polar
            try {
                console.log(`[UpdatePackage] Archiving Polar product ID: ${existingPackage.polar_product_id} as package ${existingPackage.packageName} is now inactive.`);
                await polarService.archiveProduct(existingPackage.polar_product_id);
                polarAction = "archived";
                // existingPackage.polar_product_id = null; // Pertimbangkan apakah akan menghapus ID setelah arsip
                // existingPackage.polar_metadata = {};
                // await existingPackage.save({ session });
                console.log(`[UpdatePackage] ✅ Polar product ${existingPackage.polar_product_id} archived.`);
            } catch (polarError) {
                console.error(`[UpdatePackage] ⚠️ Failed to archive Polar product ${existingPackage.polar_product_id}: ${polarError.message}`);
                errorLogs(req, res, `Polar archive failed for package ${existingPackage.packageName}: ${polarError.message}`, "controllers/packageControllers/updatePackage.js (Polar Archive)");
            }
        }


        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ // Diubah dari 201 ke 200 untuk update
            message: "Package updated successfully!",
            package: existingPackage,
            polar_action: polarAction,
            polar_product_details: polarProduct
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('[UpdatePackage] ❌ Server error during package update:', error);
        errorLogs(req, res, error.message, "controllers/packageControllers/updatePackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};