const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        token: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true, }
);

// Method to invalidate session
sessionSchema.methods.invalidateSession = async function () {
    await this.remove();
};

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
