const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const { errorLogs } = require("../../utils/errorLogs");
const polarService = require("../../services/polarService");

/**
 * Create or sync package with Polar as a product
 */
exports.syncPackageWithPolar = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { packageId } = req.params;

        // Get package from database
        const package = await PackageModel.findById(packageId).session(session);
        if (!package) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Package not found" });
        }

        // Check if package already has a Polar product ID
        if (package.polar_product_id) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                message: "Package already synced with Polar",
                polar_product_id: package.polar_product_id
            });
        }

        // Create product in Polar
        const polarProduct = await polarService.createProduct(package);

        // Update package with Polar product ID
        package.polar_product_id = polarProduct.id;
        package.polar_metadata = polarProduct;
        await package.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: "Package synced with Polar successfully",
            package: package,
            polar_product: polarProduct
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        errorLogs(req, res, error.message, "controllers/paymentControllers/polarProductController.js");
        res.status(500).json({
            success: false,
            message: "Failed to sync package with Polar",
            error: error.message
        });
    }
};

/**
 * Sync all packages with Polar
 */
exports.syncAllPackagesWithPolar = async (req, res) => {
    try {
        const packages = await PackageModel.find({ 
            isActive: true,
            $or: [
                { polar_product_id: { $exists: false } },
                { polar_product_id: null }
            ]
        });

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const package of packages) {
            try {
                const polarProduct = await polarService.createProduct(package);
                
                package.polar_product_id = polarProduct.id;
                package.polar_metadata = polarProduct;
                await package.save();

                results.push({
                    package_id: package._id,
                    package_name: package.packageName,
                    polar_product_id: polarProduct.id,
                    status: 'success'
                });
                successCount++;

                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Failed to sync package ${package._id}:`, error.message);
                results.push({
                    package_id: package._id,
                    package_name: package.packageName,
                    status: 'error',
                    error: error.message
                });
                errorCount++;
            }
        }

        res.status(200).json({
            success: true,
            message: `Synced ${successCount} packages successfully, ${errorCount} errors`,
            summary: {
                total_packages: packages.length,
                success_count: successCount,
                error_count: errorCount
            },
            results: results
        });

    } catch (error) {
        errorLogs(req, res, error.message, "controllers/paymentControllers/polarProductController.js");
        res.status(500).json({
            success: false,
            message: "Failed to sync packages with Polar",
            error: error.message
        });
    }
};

/**
 * Get Polar product information for a package
 */
exports.getPolarProductInfo = async (req, res) => {
    try {
        const { packageId } = req.params;

        const package = await PackageModel.findById(packageId);
        if (!package) {
            return res.status(404).json({ message: "Package not found" });
        }

        if (!package.polar_product_id) {
            return res.status(400).json({ 
                message: "Package not synced with Polar yet" 
            });
        }

        res.status(200).json({
            success: true,
            package: {
                id: package._id,
                name: package.packageName,
                price: package.price,
                polar_product_id: package.polar_product_id,
                polar_metadata: package.polar_metadata
            }
        });

    } catch (error) {
        errorLogs(req, res, error.message, "controllers/paymentControllers/polarProductController.js");
        res.status(500).json({
            success: false,
            message: "Failed to get Polar product info",
            error: error.message
        });
    }
};