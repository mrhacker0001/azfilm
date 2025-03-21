const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 🔹 Firebase'ga ulanadigan JSON faylni o‘qish
const serviceAccount = JSON.parse(
    Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS, "base64").toString("utf-8")
);

const axios = require('axios');

const TOKEN = process.env.BOT_TOKEN; // Bot tokeni
const CHAT_ID = '8027352397'; // Foydalanuvchi yoki kanal chat ID'si

axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: MESSAGE,
    parse_mode: "HTML"
})
    .then(response => {
        console.log('Xabar yuborildi:', response.data);
    })
    .catch(error => {
        console.error('Xatolik:', error);
    });

// 🔹 Firebase’ni ishga tushirish
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ADMIN_CHAT_ID = "@azfilm_request"; // Admin yoki guruh chat ID
const ADMIN_ID = 8027352397; // Admin Telegram ID
const MESSAGE = 'Salom! Bugun yangi aksiya bor 🚀';

const userStates = {}; // Foydalanuvchilarning holatini saqlash

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userRef = db.collection("users").doc(userId.toString());
    const doc = await userRef.get();

    if (!doc.exists) {
        await userRef.set({
            userId: userId,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name || "",
            username: ctx.from.username || "",
            joinedAt: admin.firestore.Timestamp.now(),
        });
    }

    const keyboard = [
        ["📜 Kino roʻyxati", "🔍 Kino izlash"]
    ];

    // Agar foydalanuvchi admin bo'lsa, "📢 Reklama yuborish" tugmasini qo‘shish
    if (userId === ADMIN_ID) {
        keyboard.push(["📢 Reklama yuborish"]);
    }

    ctx.reply(
        "🎬 Salom! Kino kodini yuboring yoki pastdagi tugmalardan birini tanlang 👇",
        Markup.keyboard(keyboard).resize()
    );
});

bot.hears("📜 Kino roʻyxati", async (ctx) => {
    const filmsRef = db.collection("films");
    const snapshot = await filmsRef.get();

    if (snapshot.empty) {
        return ctx.reply("❌ Hozircha hech qanday kino qoʻshilmagan.");
    }

    let message = "🎥 *Kinolar roʻyxati:*";
    snapshot.forEach((doc) => {
        const film = doc.data();
        message += `\n🎬 *${film.title}* - *${doc.id}*`;
    });

    ctx.reply(message, { parse_mode: "Markdown" });
});

bot.hears("🔍 Kino izlash", (ctx) => {
    ctx.reply("🔎 Iltimos, siz izlayotgan kino nomini kiriting!");
});

bot.hears("📢 Reklama yuborish", async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ADMIN_ID) {
        return ctx.reply("❌ Siz admin emassiz!");
    }

    userStates[userId] = "waiting_for_ad";
    ctx.reply("📩 Yuboriladigan xabarni kiriting:");
});

bot.on("text", async (ctx) => {
    const userId = ctx.from.id;

    if (userStates[userId] === "waiting_for_ad") {
        delete userStates[userId]; // Holatni tozalash

        const messageText = ctx.message.text;
        const usersRef = db.collection("users");
        const snapshot = await usersRef.get();

        if (snapshot.empty) {
            return ctx.reply("❌ Hozircha foydalanuvchilar yoʻq.");
        }

        let count = 0;
        let errors = 0;

        for (const doc of snapshot.docs) {
            const user = doc.data();
            try {
                await bot.telegram.sendMessage(user.userId, `${messageText}`, { parse_mode: "Markdown" });
                count++;
            } catch (error) {
                console.error(`Xatolik: ${error.message}`);
                errors++;
            }
        }

        return ctx.reply(`✅ Reklama ${count} ta foydalanuvchiga yuborildi! ❌ Xatoliklar: ${errors} ta`);
    }

    // Kino kodini tekshirish
    const code = ctx.message.text.trim();
    const filmRef = db.collection("films").doc(code);
    const doc = await filmRef.get();

    if (doc.exists) {
        const film = doc.data();
        return ctx.reply(
            `🎬 *${film.title}*\n📌 *Janr:* ${film.genre}\n📝 *Tavsif:* ${film.description}\n📅 *Yil:* ${film.year}\n\n🎥 *Kino tomosha qilish:* [👉 Shu yerda](${film.video_link})`,
            { parse_mode: "Markdown" }
        );
    }

    await db.collection("requests").add({
        title: code,
        requestedAt: admin.firestore.Timestamp.now(),
    });

    await ctx.reply("⏳ Bu kino hozircha bazada yoʻq. Soʻrovingiz qabul qilindi! 10 daqiqada qoʻshilishi mumkin.");

    await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📌 *Yangi kino so‘rovi:* ${code}`, { parse_mode: "Markdown" });
});

bot.launch();
console.log("🚀 Bot ishga tushdi!");