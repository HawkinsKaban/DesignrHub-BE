const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel");
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.updatePackage = async (req, res) => {
    const session = await mongoose.startTransaction();
    session.startTransaction();
    try {
        const { id } = req.params;
        const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;

        const existingPackage = await PackageModel.findById(id).session(session);
        if (!existingPackage) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Package dengan id ${id} tidak ditemukan` });
        }

        const existingCategory = await CategoryModel.findById(categoryId).session(session);
        if (!existingCategory) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Category dengan id ${categoryId} tidak ditemukan` });
        }

        const updatePackage = {
            packageName,
            price,
            discountPrice,
            durationName,
            durationInDays,
            categoryId: existingCategory._id,
            onDiscount,
            endDiscountDate,
            isActive,
            priority,
        };

        // Update package in database
        const updatedPackage = await PackageModel.findByIdAndUpdate(id, updatePackage, {
            new: true,
            session
        });

        // Sync with Polar if product ID exists
        if (existingPackage.polar_product_id) {
            try {
                const polarProduct = await polarService.updateProduct(
                    existingPackage.polar_product_id, 
                    updatedPackage
                );
                
                updatedPackage.polar_metadata = polarProduct;
                await updatedPackage.save({ session });
                
                console.log(`✅ Package synced with Polar: ${packageName} (ID: ${polarProduct.id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to sync package with Polar: ${polarError.message}`);
                // Don't fail the package update if Polar sync fails
            }
        } 
        // Create new Polar product if it doesn't exist and package is active
        else if (isActive) {
            try {
                const polarProduct = await polarService.createProduct(updatedPackage);
                
                updatedPackage.polar_product_id = polarProduct.id;
                updatedPackage.polar_metadata = polarProduct;
                await updatedPackage.save({ session });
                
                console.log(`✅ Package created in Polar: ${packageName} (ID: ${polarProduct.id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to create package in Polar: ${polarError.message}`);
                // Don't fail the package update if Polar creation fails
            }
        }
        // Archive Polar product if package is no longer active
        else if (!isActive && existingPackage.polar_product_id) {
            try {
                await polarService.archiveProduct(existingPackage.polar_product_id);
                console.log(`✅ Package archived in Polar: ${packageName} (ID: ${existingPackage.polar_product_id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to archive package in Polar: ${polarError.message}`);
                // Don't fail the package update if Polar archival fails
            }
        }

        await session.commitTransaction();
        res.status(201).json({
            message: "Package berhasil diupdate!",
            package: updatedPackage,
        });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/packageControllers/updatePackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
};