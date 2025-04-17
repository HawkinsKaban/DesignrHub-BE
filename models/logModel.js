const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        action: {
            type: String,
            required: true,
        },
        ip: {
            type: String,
            required: true,
        },
        device: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

logSchema.index({ user: 1 });
logSchema.index({ action: 1 });
logSchema.index({ ip: 1 });
logSchema.index({ device: 1 });
logSchema.index({ createdAt: -1 });

const Log = mongoose.model('Log', logSchema);

module.exports = Log;
