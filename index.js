const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
const axios = require('axios');
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const MESSAGE = "Salom! Bu test xabar.";
const TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = "-1001234567890"; // To'g'ri chat ID
const ADMIN_ID = Number(process.env.ADMIN_ID);

// Firebase sertifikatni o'qish
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const userStates = {};

// Telegramga xabar yuborish
axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: MESSAGE,
    parse_mode: "HTML"
})
    .then(response => console.log('Xabar yuborildi:', response.data))
    .catch(error => console.error('Xatolik:', error));

// Botni ishga tushirish
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

    const keyboard = [["📜 Kino roʻyxati", "🔍 Kino izlash"]];
    if (userId === ADMIN_ID) keyboard.push(["📢 Reklama yuborish"]);

    ctx.reply("🎬 Salom! Kino kodini yuboring yoki pastdagi tugmalardan birini tanlang 👇", Markup.keyboard(keyboard).resize());
});

bot.hears("🔍 Kino izlash", (ctx) => {
    userStates[ctx.from.id] = "searching";
    ctx.reply("🔎 Iltimos, siz izlayotgan kino nomini kiriting!");
});

bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const userMessage = ctx.message.text.trim();

    if (userStates[userId] === "searching") {
        delete userStates[userId];

        const filmsRef = db.collection("films");
        const snapshot = await filmsRef.where("title", "==", userMessage).get();

        if (snapshot.empty) {
            return ctx.reply("❌ Bunday kino topilmadi.");
        }

        let message = "🎬 *Topilgan kinolar:*";
        snapshot.forEach((doc) => {
            const film = doc.data();
            message += `\n🎬 *${film.title}* - *${doc.id}*`;
        });

        return ctx.reply(message, { parse_mode: "Markdown" });
    }
});

bot.launch();
console.log("🚀 Bot ishga tushdi!");
