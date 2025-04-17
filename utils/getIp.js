const getPublicIp = async (req) => {
    let publicIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    if (publicIp) {
        publicIp = publicIp.split(",")[0];
    }
    return publicIp;
};

module.exports = { getPublicIp };
