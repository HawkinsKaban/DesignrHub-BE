const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");



exports.updateUserPayment = async (req, res) => {
    try {
        const userPayment = await PaymentModel.findById(req.params.id);

        if (!userPayment) {
            return res.status(404).json({ message: "User payment not found" });
        }

        const initStatus = req.body.initial_status?.value;
        userPayment.payment_status =
            req.body.payment_status || userPayment.payment_status;
        userPayment.method = req.body.method || userPayment.method;

        const dataUser = await UserModel.findById(userPayment.user_id);
        const package = await PackageModel.findById(userPayment.package_id);

        if (!dataUser || !package) {
            return res.status(404).json({ message: "User or package not found" });
        }

        const currentDate = new Date();

        if (userPayment.payment_status === "paid") {

            let newExpiredTime = new Date();
            newExpiredTime.setDate(currentDate.getDate() + package.durationInDays);

            const newPackage = {
                packageId: package._id,
                activeDate: newExpiredTime,
                priority: package.priority,
                statusActive: true,
                pendingDate: 0,
            };
            console.log("New package details:", newPackage);

            if (dataUser.activePackage.length === 0) {
                console.log("No active packages found. Adding the new package...");
                dataUser.activePackage.push(newPackage);
                dataUser.premiumAccess = true;
                dataUser.isPremium = true;
                dataUser.subscriptionPackage = package._id;
                dataUser.premiumExpiresAt = newExpiredTime;

                console.log("Updated user data with new package:", dataUser);
                await userPayment.save();
                await dataUser.save();
                return res.status(200).json({
                    success: true,
                    message: "Payment updated to paid for new package",
                });
            }

            const existingIndex = dataUser.activePackage.findIndex(
                (item) => item.priority === package.priority
            );
            console.log("Existing package index for the same priority:",existingIndex);

            if (dataUser.isPremium && existingIndex === 0) {
                console.log("User is premium, and the package has top priority. Extending expiration...");
                const activeDateSame = dataUser.activePackage[existingIndex].activeDate;
                const extendedExpiredTime = new Date(activeDateSame);
                extendedExpiredTime.setDate(
                    extendedExpiredTime.getDate() + package.durationInDays
                );
                dataUser.activePackage[existingIndex].activeDate = extendedExpiredTime;
                dataUser.premiumExpiresAt = extendedExpiredTime;

                console.log("Updated active package expiration:",dataUser.activePackage[existingIndex]);
                await userPayment.save();
                await dataUser.save();
                return res.status(200).json({
                    success: true,
                    message: "Payment extended for existing top-priority package",
                });
            }

            if (dataUser.isPremium && existingIndex !== 0 && existingIndex !== -1) {
                console.log(
                    "User is premium, and the package is of the same priority but not top priority."
                );
                dataUser.activePackage[existingIndex].pendingDate +=
                    package.durationInDays;
                dataUser.activePackage[existingIndex].statusActive = false;

                console.log(
                    "Updated pending package details:",
                    dataUser.activePackage[existingIndex]
                );
                dataUser.activePackage.sort((a, b) => b.priority - a.priority);
                await userPayment.save();
                await dataUser.save();
                return res.status(200).json({
                    success: true,
                    message: "Payment added as pending for same-priority package",
                });
            }

            if (dataUser.isPremium && existingIndex === -1) {
                console.log(
                    "User is premium, but the package is new (not in activePackage)."
                );
                const topPriorityPackage = dataUser.activePackage[0];
                console.log("Top priority package details:", topPriorityPackage);

                if (topPriorityPackage.priority < package.priority) {
                    console.log(
                        "New package has higher priority than the current top-priority package."
                    );
                    dataUser.activePackage.push(newPackage);

                    const gapDays = topPriorityPackage.activeDate
                        ? Math.ceil(
                            (topPriorityPackage.activeDate.getTime() -
                                currentDate.getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                        : 0;

                    if (topPriorityPackage.statusActive) {
                        console.log("Updating current top-priority package to pending...");
                        topPriorityPackage.activeDate = null;
                        topPriorityPackage.statusActive = false;
                        topPriorityPackage.pendingDate += gapDays > 0 ? gapDays : 0;
                    }

                    dataUser.premiumExpiresAt = newExpiredTime;
                    dataUser.subscriptionPackage = package._id;

                    console.log(
                        "Updated user data with new top-priority package:",
                        dataUser
                    );
                    dataUser.activePackage.sort((a, b) => b.priority - a.priority);
                    await userPayment.save();
                    await dataUser.save();
                    return res.status(200).json({
                        success: true,
                        message: "Payment activated with new top-priority package",
                    });
                } else {
                    console.log(
                        "New package has lower priority than the current top-priority package."
                    );
                    newPackage.pendingDate = package.durationInDays;
                    newPackage.statusActive = false;

                    dataUser.activePackage.push(newPackage);
                    dataUser.activePackage.sort((a, b) => b.priority - a.priority);
                    console.log(
                        "Updated user data with lower-priority package:",
                        dataUser
                    );
                    await userPayment.save();
                    await dataUser.save();
                    return res.status(200).json({
                        success: true,
                        message: "Payment added as lower-priority package",
                    });
                }
            }
        } else if (
            userPayment.payment_status === "decline" &&
            initStatus === "paid"
        ) {
            console.log(
                "Processing payment as 'decline' from an initial status of 'paid'..."
            );

            const existingIndex = dataUser.activePackage.findIndex(
                (item) => item.priority === package.priority
            );
            console.log(
                "Existing package index for the declined payment:",
                existingIndex
            );

            if (existingIndex === 0) {
                console.log("Declining payment for the top-priority package...");
                const activeDate = dataUser.activePackage[existingIndex].activeDate;
                console.log("Current active date for the package:", activeDate);

                const reducedTime = new Date(activeDate);
                reducedTime.setDate(reducedTime.getDate() - package.durationInDays);
                console.log("New active date after reducing duration:", reducedTime);

                console.log(
                    "sama dengan hari ini : ",
                    reducedTime.getTime() === currentDate.getTime()
                );
                console.log(
                    "hasil pengurangan : ",
                    reducedTime.getDate() - package.durationInDays
                );
                // kalo sama dengan hari ini
                if (reducedTime.getTime() <= currentDate.getTime()) {
                    console.log("Active package expired. Removing it...");
                    dataUser.activePackage.splice(existingIndex, 1);
                    if (dataUser.activePackage.length === 0) {
                        console.log(
                            "No more active packages. Resetting user premium access..."
                        );
                        dataUser.premiumAccess = false;
                        dataUser.isPremium = false;
                        dataUser.subscriptionPackage = null;
                    } else {
                        console.log(
                            "Active packages remaining. User premium access retained."
                        );
                        const nextPackage = dataUser.activePackage[0];
                        nextPackage.activeDate = new Date(
                            new Date().getTime() +
                            nextPackage.pendingDate * 24 * 60 * 60 * 1000
                        );
                        dataUser.subscriptionPackage = nextPackage.packageId;
                        dataUser.premiumExpiresAt = nextPackage.activeDate;
                        await dataUser.save();
                    }
                } else {
                    console.log("Updating active date for the package to:", reducedTime);
                    dataUser.activePackage[existingIndex].activeDate = reducedTime;
                }

                await userPayment.save();
                await dataUser.save();
                console.log(
                    "Payment declined and top-priority package updated successfully."
                );
                return res.status(200).json({
                    success: true,
                    message: "Payment declined and package updated",
                });
            }

            if (existingIndex !== 0 && existingIndex !== -1) {
                console.log(
                    "Declining payment for a non-top-priority pending package..."
                );
                const currentPendingDate =
                    dataUser.activePackage[existingIndex].pendingDate;
                console.log(
                    "Current pending date for the package:",
                    currentPendingDate
                );

                dataUser.activePackage[existingIndex].pendingDate -=
                    package.durationInDays;
                console.log(
                    "New pending date after reduction:",
                    dataUser.activePackage[existingIndex].pendingDate
                );

                if (dataUser.activePackage[existingIndex].pendingDate <= 0) {
                    // kalaupun pendingDate nya kurang dari 0 maka hapus data activePackage nya sesuai dengan index nya
                    console.log("Pending package expired. Removing it...");
                    dataUser.activePackage.splice(existingIndex, 1);
                }

                await userPayment.save();
                await dataUser.save();
                console.log(
                    "Payment declined and pending package updated successfully."
                );
                return res.status(200).json({
                    success: true,
                    message: "Payment declined for pending package",
                });
            }

            console.log("No matching package found for the declined payment.");
        }

        await userPayment.save();
        await dataUser.save();
        return res
            .status(200)
            .json({ success: true, message: "Payment status updated successfully" });
    } catch (error) {
        console.error("🚨 Error Occurred:", error);
        res.status(500).json({ message: "Server error" });
    }
};
