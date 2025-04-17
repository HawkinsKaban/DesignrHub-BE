const fs = require('fs');
const path = require('path');
const Logo = 'https://staging-pp.com/be/uploads/email/logo-premium-putih.png';
function generateEmailIndoTemplate(verificationUrl) {
    return `
      <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Document</title>
                <style>
                        .blok {
                            margin: 20px auto;
                            width: 500px;
                            height: 450px;
                            border-radius: 15px;
                            background: linear-gradient(93.58deg, #061525 -2%, #144B75 117.56%);
                            position: relative;
                            animation: mymove 5s infinite;
                            padding-left: 30px;
                            padding-right: 30px;
                            padding-top: 10px;
                            padding-bottom: 30px;
                            display: flex;
                            font-family: 'Poppins', sans-serif;
                            box-shadow: 0px 0px 50px 0px rgba(0,0,0,0.75);
                        }
                        .blok p{
                            font-size:16px !important;
                        }
                        .text{
                            color: white;
                            margin-left: 20px;
                            align-items: center;
                            text-align: center;
                            margin: auto;
                        }
                        .text p{
                            width: 25rem;
                            margin: 40px 0;
                        }
                        .text img{
                            width: 15rem;
                            margin: 20px 0 0 0;
                        }
                        .button-64 {
                            align-items: center;
                            background: linear-gradient(90deg, rgba(33, 141, 161, 0.5) 0%, rgba(2, 40, 126, 0.5) 100%);
                            border: 0;
                            border-radius: 0.5rem;
                            box-sizing: border-box;
                            color: #FFFFFF;
                            display: flex;
                            font-family: Phantomsans, sans-serif;
                            font-size: 20px;
                            justify-content: center;
                            line-height: 1em;
                            max-width: 15rem;
                            margin: 0 auto;
                            padding: 3px;
                            text-decoration: none;
                            user-select: none;
                            -webkit-user-select: none;
                            touch-action: manipulation;
                            white-space: nowrap;
                            cursor: pointer;
                            padding: 15px 0;
                        }
                        .button-64:active,
                        .button-64:hover {
                            background: linear-gradient(90deg, rgba(33, 141, 161, 1) 0%, rgba(2, 40, 126, 1) 100%);
                        }
                    </style>
            </head>
            <body>
                <div class="backdrop">
                    <div class="tnc">
                        <h2 className="text-3xl font-bold mb-8 text-center">
                            Syarat & Ketentuan
                        </h2>
                        <ul
                            className="text-sm mb-8 max-w-[500px] mx-auto px-10 max-h-[50vh] overflow-y-scroll">
                            <li className="text-justify">
                                <span className="font-bold">
                                    Akses Premium Portal
                                </span>
                                <br />
                                <p className>
                                    Premium Portal adalah platform berbasis web yang
                                    diakses melalui ekstensi browser untuk PC/Laptop.
                                    Pengguna juga dapat mengaksesnya menggunakan
                                    perangkat Android atau iOS. Namun, perlu
                                    diperhatikan bahwa beberapa layanan, seperti
                                    Netflix, mungkin tidak sepenuhnya kompatibel dengan
                                    perangkat tersebut. Untuk pengalaman terbaik, kami
                                    menyarankan penggunaan melalui PC atau Laptop.
                                </p>
                            </li>
                            <li className="text-justify mt-4">
                                <span className="font-bold">
                                    Kebijakan Refund
                                </span>
                                <br />
                                <p className="my-2">
                                    1. Pengguna dianggap telah memahami cara penggunaan
                                    Premium Portal sebagaimana dijelaskan pada bagian
                                    sebelumnya. Kesalahan penggunaan akibat kurangnya
                                    pemahaman merupakan tanggung jawab pengguna. Oleh
                                    karena itu, kami tidak dapat memproses pengembalian
                                    dana apabila prosedur atau ketentuan yang berlaku
                                    tidak diikuti.
                                </p>
                                <p className>
                                    2. Proses pembelian langganan Premium Portal hanya
                                    dapat dilakukan melalui situs resmi kami di
                                    Premiumportal.id. Kami tidak menjual layanan ini
                                    melalui platform e-commerce atau pihak ketiga. Akun
                                    yang diperoleh melalui jalur tidak resmi akan
                                    dinonaktifkan, dan kami tidak bertanggung jawab atas
                                    konsekuensi tersebut.
                                </p>
                            </li>
                            <li className="text-justify mt-4">
                                <span className="font-bold">
                                    Verifikasi Akun
                                </span>
                                <br />
                                <p className>
                                    Untuk menyelesaikan proses pendaftaran, pengguna
                                    diminta untuk memasukkan email dan nomor WhatsApp
                                    aktif. Pastikan kedua kontak dapat diakses guna
                                    memastikan proses verifikasi berjalan lancar.
                                </p>
                            </li>
                            <li className="text-justify mt-4">
                                <span className="font-bold">
                                    Keamanan Akun
                                </span>
                                <br />
                                <p className>
                                    Keamanan akun adalah tanggung jawab pribadi
                                    pengguna. Untuk menjaga keamanan:
                                </p>
                                <p className="ml-5 my-1">
                                    1. Jangan membagikan informasi login Anda kepada
                                    pihak lain.
                                </p>
                                <p className="ml-5 ">
                                    2. Pastikan Anda selalu menggunakan metode pembelian
                                    resmi dari website kami.
                                </p>
                            </li>
                            <li className="text-justify mt-4">
                                <span className="font-bold">
                                    Larangan Penggunaan
                                </span>
                                <br />
                                <p className>
                                    Pengguna dilarang melakukan tindakan berikut:
                                </p>
                                <p className="ml-5 mt-1">
                                    1. Melakukan penipuan pembayaran (fraud).
                                </p>
                                <p className="ml-5 mt-1">
                                    2. Menjual atau menyebarluaskan akun Premium Portal
                                    untuk kepentingan komersial.
                                </p>
                                <p className="ml-5 mt-1">
                                    3. Mengambil data login (cookies) atau membagikan
                                    data login milik Premium Portal untuk tujuan
                                    komersial.
                                </p>
                                <p className="ml-5 mt-1">
                                    4. Menghapus akun, mengubah metode pembayaran, atau
                                    mengubah password setiap akun layanan Premium Portal
                                    tanpa persetujuan resmi dari kami.
                                </p>
                            </li>
                            <li className="text-justify mt-4">
                                <span className="font-bold">
                                    Penangguhan Akun
                                </span>
                                <br />
                                <p className>
                                    Kami memiliki hak untuk menangguhkan akun pengguna
                                    jika ditemukan adanya pelanggaran terhadap ketentuan
                                    yang berlaku. Gunakan layanan Premium Portal dengan
                                    bijak.
                                </p>
                            </li>
                            <li className="text-justify mt-4">
                                <span className="font-bold">
                                    Perubahan Syarat dan Ketentuan
                                </span>
                                <br />
                                <p className>
                                    Kami berhak melakukan perubahan pada syarat dan
                                    ketentuan ini sewaktu-waktu. Segala perubahan akan
                                    diinformasikan melalui kanal komunikasi resmi kami.
                                </p>
                            </li>
                        </ul>
                    </div>
                    <div class="blok">
                        <div class="text">
                            <img src=${Logo} alt="Logo">
                            <p>
                                Kami menerima permintaan untuk memperbarui Kata Sandi
                                Anda. Klik tombol di bawah ini untuk memulai.
                            </p>
                            <a class="button-64" role="button" href=${verificationUrl}>
                                <span class="text">
                                    Perbarui Kata Sandi
                                </span>
                            </a>
                            <p>
                                Jika Anda menerima pesan ini secara tidak sengaja,
                                abaikan email ini. Jika Anda merasa seseorang
                                menggunakan akun Anda tanpa izin, silakan hubungi kami.
                            </p>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    `;
}

function generateEmailEnglishTemplate(verificationUrl) {
    return `
      <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Document</title>
                <style>
                    .blok {
                        margin: 20px auto;
                        width: 500px;
                        height: 450px;
                        border-radius: 15px;
                        background: linear-gradient(93.58deg, #061525 -2%, #144B75 117.56%);
                        position: relative;
                        animation: mymove 5s infinite;
                        padding-left: 30px;
                        padding-right: 30px;
                        padding-top: 10px;
                        padding-bottom: 30px;
                        display: flex;
                        font-family: 'Poppins', sans-serif;
                        box-shadow: 0px 0px 50px 0px rgba(0,0,0,0.75);
                    }
                    .text {
                        color: white;
                        margin-left: 20px;
                        align-items: center;
                        text-align: center;
                        margin: auto;
                    }
                    .text p {
                        width: 25rem;
                        margin: 40px 0;
                    }
                    .text img {
                        width: 15rem;
                        margin: 20px 0 0 0;
                    }
                    .button-64 {
                        align-items: center;
                        background: linear-gradient(90deg, rgba(33, 141, 161, 0.5) 0%, rgba(2, 40, 126, 0.5) 100%);
                        border: 0;
                        border-radius: 0.5rem;
                        box-sizing: border-box;
                        color: #FFFFFF;
                        display: flex;
                        font-family: Phantomsans, sans-serif;
                        font-size: 20px;
                        justify-content: center;
                        line-height: 1em;
                        max-width: 15rem;
                        margin: 0 auto;
                        padding: 3px;
                        text-decoration: none;
                        user-select: none;
                        -webkit-user-select: none;
                        touch-action: manipulation;
                        white-space: nowrap;
                        cursor: pointer;
                        padding: 15px 0;
                    }
                    .button-64:active,
                    .button-64:hover {
                        background: linear-gradient(90deg, rgba(33, 141, 161, 1) 0%, rgba(2, 40, 126, 1) 100%);
                    }
                </style>
            </head>
            <body>
                <div class="backdrop">
                    <div class="tnc">
                        <h2 class="text-3xl font-bold mb-8 text-center">
                            Terms & Conditions
                        </h2>
                        <ul class="text-sm mb-8 max-w-[500px] mx-auto px-10 max-h-[50vh] overflow-y-scroll">
                            <li class="text-justify">
                                <span class="font-bold">
                                    Premium Portal Access
                                </span>
                                <br />
                                <p className>
                                    Premium Portal is a web-based platform accessible through a browser extension for PC/Laptop. Users can also access it using Android or iOS devices. However, it is important to note that some services, such as Netflix, may not be fully compatible with these devices. For the best experience, we recommend using a PC or Laptop.
                                </p>
                            </li>
                            <li class="text-justify mt-4">
                                <span class="font-bold">
                                    Refund Policy
                                </span>
                                <br />
                                <p className="my-2">
                                    1. Users are deemed to have understood how to use the Premium Portal as explained in the previous section. Any usage errors due to a lack of understanding are the user's responsibility. Therefore, we cannot process refunds if the applicable procedures or terms are not followed.
                                </p>
                                <p className>
                                    2. Subscription to Premium Portal can only be made through our official website at Premiumportal.id. We do not sell this service through e-commerce platforms or third parties. Accounts obtained through unofficial channels will be deactivated, and we are not responsible for the consequences.
                                </p>
                            </li>
                            <li class="text-justify mt-4">
                                <span class="font-bold">
                                    Account Verification
                                </span>
                                <br />
                                <p className>
                                    To complete the registration process, users are required to provide a valid email address and active WhatsApp number. Please ensure both contacts are accessible to ensure the verification process runs smoothly.
                                </p>
                            </li>
                            <li class="text-justify mt-4">
                                <span class="font-bold">
                                    Account Security
                                </span>
                                <br />
                                <p className>
                                    Account security is the user's personal responsibility. To maintain security:
                                </p>
                                <p className="ml-5 my-1">
                                    1. Do not share your login information with others.
                                </p>
                                <p className="ml-5 ">
                                    2. Always use the official payment methods available on our website.
                                </p>
                            </li>
                            <li class="text-justify mt-4">
                                <span class="font-bold">
                                    Prohibited Uses
                                </span>
                                <br />
                                <p className>
                                    Users are prohibited from performing the following actions:
                                </p>
                                <p className="ml-5 mt-1">
                                    1. Engaging in payment fraud.
                                </p>
                                <p className="ml-5 mt-1">
                                    2. Selling or distributing Premium Portal accounts for commercial purposes.
                                </p>
                                <p className="ml-5 mt-1">
                                    3. Harvesting login data (cookies) or sharing Premium Portal login data for commercial purposes.
                                </p>
                                <p className="ml-5 mt-1">
                                    4. Deleting accounts, changing payment methods, or changing passwords for any Premium Portal service account without our official consent.
                                </p>
                            </li>
                            <li class="text-justify mt-4">
                                <span class="font-bold">
                                    Account Suspension
                                </span>
                                <br />
                                <p className>
                                    We reserve the right to suspend a user's account if violations of the terms are found. Please use the Premium Portal services responsibly.
                                </p>
                            </li>
                            <li class="text-justify mt-4">
                                <span class="font-bold">
                                    Changes to Terms and Conditions
                                </span>
                                <br />
                                <p className>
                                    We reserve the right to make changes to these terms and conditions at any time. Any changes will be communicated through our official communication channels.
                                </p>
                            </li>
                        </ul>
                    </div>
                    <div class="blok">
                        <div class="text">
                            <img src=${Logo} alt="Logo">
                            <p>
                                We have received a request to update your password. Click the button below to get started.
                            </p>
                            <a class="button-64" role="button" href=${verificationUrl}>
                                <span class="text">
                                    Update Password
                                </span>
                            </a>
                            <p>
                                If you received this message by mistake, please ignore this email. If you believe someone is using your account without permission, please contact us.
                            </p>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    `;
}



function generateVerifEmail(verificationUrl) {
    return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Document</title>
                    <style>
                            .kotak{
                                width: 100vw;
                                height: fit-content;
                                padding: 30px;
                                background-color: white;
                                display: flex;
                                justify-content: center;
                            }
                            .blok {
                                width: 500px;
                                height: 450px;
                                border-radius: 15px;
                                background: linear-gradient(93.58deg, #061525 -2%, #144B75 117.56%);
                                position: relative;
                                animation: mymove 5s infinite;
                                padding-left: 30px;
                                padding-right: 30px;
                                padding-top: 10px;
                                padding-bottom: 30px;
                                display: flex;
                                font-family: 'Poppins', sans-serif;
                                box-shadow: 0px 0px 50px 0px rgba(0,0,0,0.75);
                            }
                            .text{
                                color: white;
                                margin-left: 20px;
                                align-items: center;
                                text-align: center;
                                margin: auto;
                            }
                            .text p{
                                width: 25rem;
                                margin: 40px 0;
                            }
                            .text img{
                                width: 15rem;
                                margin: 20px 0 0 0;
                            }
                            .button-64 {
                                align-items: center;
                                background: linear-gradient(90deg, rgba(33, 141, 161, 0.5) 0%, rgba(2, 40, 126, 0.5) 100%);
                                border: 0;
                                border-radius: 0.5rem;
                                box-sizing: border-box;
                                color: #FFFFFF;
                                display: flex;
                                font-family: Phantomsans, sans-serif;
                                font-size: 20px;
                                justify-content: center;
                                line-height: 1em;
                                max-width: 15rem;
                                margin: 0 auto;
                                padding: 3px;
                                text-decoration: none;
                                user-select: none;
                                -webkit-user-select: none;
                                touch-action: manipulation;
                                white-space: nowrap;
                                cursor: pointer;
                                padding: 15px 0;
                            }
                            .button-64:active,
                            .button-64:hover {
                                background: linear-gradient(90deg, rgba(33, 141, 161, 1) 0%, rgba(2, 40, 126, 1) 100%);
                            }
                        </style>
                </head>
                <body>
                    <div class="kotak">
                        <div class="blok">
                            <div class="text">
                            <img src=${Logo} alt="Logo">
                                <p>
                                    Kami senang Anda bergabung dengan Premium Portal. Sebelum Anda dapat mulai menikmati semua fitur yang kami tawarkan, kami memerlukan Anda untuk memverifikasi alamat email Anda.
                                </p>
                                <a class="button-64" role="button" href=${verificationUrl}>
                                    <span class="text">
                                        Verifikasi Email
                                    </span>
                                </a>
                                <p>
                                    Jika Anda menerima pesan ini secara tidak sengaja,
                                    abaikan email ini. Jika Anda merasa seseorang
                                    menggunakan akun Anda tanpa izin, silakan hubungi kami.
                                </p>
                            </div>
                        </div>
                    </div> 
                </body>
            </html>
    `;
}


module.exports = {
    generateEmailIndoTemplate,
    generateEmailEnglishTemplate,
    generateVerifEmail,
};
