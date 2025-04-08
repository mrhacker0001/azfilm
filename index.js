const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 8027352397; // O'zingizning Telegram ID'ingiz
const ADMIN_CHAT_ID = "@azfilm_request";

const serviceAccount = JSON.parse(
    Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS, "base64").toString("utf-8")
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const userStates = {};

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userRef = db.collection("users").doc(userId.toString());
    const doc = await userRef.get();

    if (!doc.exists) {
        await userRef.set({
            userId: userId,
            firstName: ctx.from.first_name || "",
            lastName: ctx.from.last_name || "",
            username: ctx.from.username || "",
            joinedAt: admin.firestore.Timestamp.now(),
        });
    }

    const keyboard = [["📜 Kino roʻyxati", "🔍 Kino izlash"]];
    if (userId === ADMIN_ID) {
        keyboard.push(["📢 Reklama yuborish", "👥 Obunachilar soni"]);
    }

    ctx.reply(
        "🎬 Salom! Kino kodini yuboring yoki pastdagi tugmalardan birini tanlang 👇",
        Markup.keyboard(keyboard).resize()
    );
});

// Faqat admin video yuborishi
bot.on('video', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Sizga ruxsat yo‘q.");

    const fileId = ctx.message.video.file_id;
    await ctx.reply(`✅ Video qabul qilindi!\n📁 <code>${fileId}</code>\n\n💾 Endi bu file_id’ni Firestore bazasiga saqlang.`, {
        parse_mode: "HTML"
    });
});

// Kino ro'yxati
bot.hears("📜 Kino roʻyxati", async (ctx) => {
    const snapshot = await db.collection("films").get();

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

// Kino izlash tugmasi
bot.hears("🔍 Kino izlash", (ctx) => {
    ctx.reply("🔎 Iltimos, siz izlayotgan kino kodini yuboring!");
});

// Obunachilar soni (faqat admin)
bot.hears("👥 Obunachilar soni", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Siz admin emassiz!");
    const snapshot = await db.collection("users").get();
    ctx.reply(`📊 Hozircha botda *${snapshot.size}* ta foydalanuvchi mavjud.`, { parse_mode: "Markdown" });
});

// Reklama yuborish (faqat admin)
bot.hears("📢 Reklama yuborish", (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Siz admin emassiz!");
    userStates[ctx.from.id] = "waiting_for_ad";
    ctx.reply("📩 Yuboriladigan xabarni kiriting:");
});

// Kino kodi bilan qidirish yoki reklama yuborish
bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    if (userStates[userId] === "waiting_for_ad") {
        delete userStates[userId];
        const snapshot = await db.collection("users").get();
        let sent = 0, failed = 0;

        for (const doc of snapshot.docs) {
            const user = doc.data();
            try {
                await bot.telegram.sendMessage(user.userId, text, { parse_mode: "Markdown" });
                sent++;
            } catch (err) {
                console.error(err.message);
                failed++;
            }
        }
        return ctx.reply(`✅ Reklama ${sent} ta foydalanuvchiga yuborildi.\n❌ Xatoliklar: ${failed} ta`);
    }

    // Kino qidirish
    const filmDoc = await db.collection("films").doc(text).get();
    if (filmDoc.exists) {
        const film = filmDoc.data();

        try {
            await ctx.replyWithVideo(film.video_link, {
                caption: `🎬 *${film.title}*\n📌 *Janr:* ${film.genre}\n📝 *Tavsif:* ${film.description}\n📅 *Yil:* ${film.year}`,
                parse_mode: "Markdown"
            });
        } catch (err) {
            console.error("Video yuborishda xatolik:", err.message);
            ctx.reply("❌ Video yuborishda xatolik yuz berdi.");
        }
        return;
    }

    // Kino topilmasa
    await db.collection("requests").add({
        title: text,
        requestedAt: admin.firestore.Timestamp.now(),
    });

    ctx.reply("⏳ Bu kino hozircha bazada yoʻq. Soʻrovingiz qabul qilindi!");
    bot.telegram.sendMessage(ADMIN_CHAT_ID, `📌 *Yangi kino so‘rovi:* ${text}`, { parse_mode: "Markdown" });
});

bot.launch();
console.log("🚀 Bot ishga tushdi!");
