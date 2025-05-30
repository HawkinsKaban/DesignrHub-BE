// services/polar/client.js
const { Polar } = require('@polar-sh/sdk');
require('dotenv').config(); // Pastikan variabel environment dimuat

console.log('Initializing Polar client...');
console.log(`POLAR_ACCESS_TOKEN exists: ${!!process.env.POLAR_ACCESS_TOKEN}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

let polarClientInstance;

try {
    if (!process.env.POLAR_ACCESS_TOKEN) {
        // Di lingkungan produksi, ini seharusnya menjadi error fatal.
        // Untuk development, Anda bisa membiarkan dummy client jika itu membantu,
        // tetapi idealnya, token harus selalu ada.
        if (process.env.NODE_ENV === 'production') {
            throw new Error('CRITICAL: POLAR_ACCESS_TOKEN is not set in environment variables for production.');
        } else {
            console.warn('WARNING: POLAR_ACCESS_TOKEN is not set. Using a dummy client for non-production environment.');
            // Fallback ke dummy client jika dibutuhkan untuk development tanpa token
            // (Kode dummy client seperti yang Anda miliki bisa ditempatkan di sini)
            // Namun, untuk integrasi nyata, lebih baik throw error atau handle dengan jelas.
            // Untuk saat ini, kita akan throw error jika token tidak ada, bahkan di development,
            // untuk mendorong penggunaan token yang benar.
            throw new Error('POLAR_ACCESS_TOKEN is not set in environment variables.');
        }
    }
    
    polarClientInstance = new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN,
        // Gunakan 'sandbox' jika NODE_ENV bukan 'production', selain itu gunakan 'production'
        server: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
    });
    console.log('✅ Polar client initialized successfully for environment:', process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

} catch (error) {
    console.error('❌❌❌ CRITICAL FAILURE: Failed to initialize Polar client:', error.message);
    // Jika gagal inisialisasi, terutama di produksi, aplikasi mungkin tidak bisa berjalan dengan benar.
    // Pertimbangkan untuk menghentikan aplikasi atau memiliki mekanisme fallback yang sangat jelas.
    // Untuk sekarang, kita akan re-throw error agar masalah ini terlihat jelas.
    throw error; 
}

module.exports = polarClientInstance;