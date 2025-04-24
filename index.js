const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 8027352397; 
const ADMIN_CHAT_ID = "@azfilm_request";

const serviceAccount = JSON.parse(
    Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS, "base64").toString("utf-8")
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const userStates = {}; 
const advData = {}; 

const CHANNELS = [
    "@@fcbuznews_2025",
];
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

    const buttons = CHANNELS.map((ch, i) =>
        [Markup.button.url(`${i + 1} - kanal`, `https://t.me/${ch.replace("@", "")}`)]
    );
    buttons.push([Markup.button.callback("✅ Tekshirish", "check_membership")]);

    await ctx.reply(
        "❌ Kechirasiz botimizdan foydalanishdan oldin ushbu kanallarga a'zo bo'lishingiz kerak.",
        Markup.inlineKeyboard(buttons)
    );
});

bot.action("check_membership", async (ctx) => {
    const userId = ctx.from.id;
    let notSubscribed = [];

    for (const ch of CHANNELS) {
        try {
            const res = await bot.telegram.getChatMember(ch, userId);
            if (["left", "kicked"].includes(res.status)) {
                notSubscribed.push(ch);
            }
        } catch (err) {
            console.log(`Error checking ${ch}:`, err.message);
            notSubscribed.push(ch);
        }
    }

    if (notSubscribed.length === 0) {
        await ctx.reply("✅ Tabriklaymiz! Siz barcha kanallarga a'zo bo'lgansiz. Endi botdan foydalanishingiz mumkin.");
    } else {
        await ctx.reply("❌ Siz hali quyidagi kanallarga obuna bo‘lmagansiz:\n" + notSubscribed.join("\n"));
    }

    await ctx.answerCbQuery();
});

bot.on('video', async (ctx) => {
    const userId = ctx.from.id;

    if (userId !== ADMIN_ID) {
        return ctx.reply("❌ Sizga ruxsat yo‘q.");
    }

    const fileId = ctx.message.video.file_id;

    await ctx.reply(`✅ Video qabul qilindi!\n📁 <code>${fileId}</code>\n\n💾 Endi bu file_id’ni Firestore bazasiga saqlang.`, {
        parse_mode: "HTML"
    });
});


bot.hears("📢 Reklama yuborish", async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ADMIN_ID) return ctx.reply("❌ Siz admin emassiz!");

    userStates[userId] = "waiting_for_adv_text";
    await ctx.reply("📝 Reklama matnini yuboring (link ham bo'lishi mumkin):");
});


bot.hears("👥 Obunachilar soni", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Siz admin emassiz!");
    const snapshot = await db.collection("users").get();
    await ctx.reply(`📊 Hozircha botda *${snapshot.size}* ta foydalanuvchi mavjud.`, { parse_mode: "Markdown" });
});

bot.hears("📜 Kino roʻyxati", async (ctx) => {
    const snapshot = await db.collection("films").get();
    if (snapshot.empty) return ctx.reply("❌ Hozircha hech qanday kino qoʻshilmagan.");

    let message = "🎥 *Kinolar roʻyxati:*";
    snapshot.forEach((doc) => {
        const film = doc.data();
        message += `\n🎬 *${film.title}* - *${doc.id}*`;
    });
    await ctx.reply(message, { parse_mode: "Markdown" });
});

// Kino izlash tugmasi
bot.hears("🔍 Kino izlash", (ctx) => {
    ctx.reply("🔎 Iltimos, siz izlayotgan kino kodini yuboring!");
});

bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Reklama matnini qabul qilish (faqat admin uchun)
    if (userStates[userId] === "waiting_for_adv_text") {
        advData[userId] = { caption: text };
        userStates[userId] = "waiting_for_text_confirm";

        return ctx.reply(
            "❓ Reklamani yuborishni tasdiqlaysizmi?",
            Markup.inlineKeyboard([
                Markup.button.callback("✅ Ha", "confirm_adv_text"),
                Markup.button.callback("❌ Yo'q", "cancel_adv_text")
            ])
        );
    }

    // Aks holda kino kodi sifatida tekshiriladi:
    const filmDoc = await db.collection("films").doc(text).get();
    if (filmDoc.exists) {
        const film = filmDoc.data();
        try {
            let caption = "";

            if (film.title && film.title.startsWith("https://t.me/junior_pubgm")) {
                caption += `🔗 [JUNIOR PUBGM](${film.title})\n`;
            } else if (film.title) {
                caption += `🎬 *${film.title}*\n`;
            }


            if (film.genre) caption += `📌 *Janr:* ${film.genre}\n`;
            if (film.description) caption += `📝 *Tavsif:* ${film.description}\n`;
            if (film.year) caption += `📅 *Yil:* ${film.year}\n`;

            await ctx.replyWithVideo(film.video_link, {
                caption,
                parse_mode: "Markdown"
            });

        } catch (err) {
            console.error("Video yuborishda xatolik:", err.message);
            await ctx.reply("❌ Video yuborishda xatolik yuz berdi.");
        }
        return;
    }

    // Kino topilmasa so'rov saqlanadi
    await db.collection("requests").add({
        title: text,
        requestedAt: admin.firestore.Timestamp.now(),
    });
    await ctx.reply("⏳ Bu kino hozircha bazada yoʻq. Soʻrovingiz qabul qilindi!");
    bot.telegram.sendMessage(ADMIN_CHAT_ID, `📌 *Yangi kino so‘rovi:* ${text}`, { parse_mode: "Markdown" });
});


// Callback query: reklama tasdiqlash yoki bekor qilish
// Tasdiqlansa matnli reklamani yuborish
bot.action("confirm_adv_text", async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ADMIN_ID || userStates[userId] !== "waiting_for_text_confirm") {
        return ctx.answerCbQuery("❌ Ruxsat yo'q yoki amal muddati o'tgan.");
    }

    await ctx.answerCbQuery("Reklama yuborilmoqda...");
    const adv = advData[userId];
    const usersSnapshot = await db.collection("users").get();

    let success = 0;
    let failed = 0;

    for (const doc of usersSnapshot.docs) {
        const user = doc.data();
        try {
            await bot.telegram.sendMessage(user.userId, adv.caption, { parse_mode: "Markdown" });
            success++;
        } catch (error) {
            failed++;
            console.error(`Xatolik (${user.userId}): ${error.message}`);
            if (
                error.message.includes("bot was blocked") ||
                error.message.includes("user is deactivated")
            ) {
                await db.collection("users").doc(user.userId.toString()).delete();
            }
        }
    }

    await ctx.reply(`✅ Reklama yuborildi!\n🟢 Muvaffaqiyatli: ${success} ta\n🔴 Xatolik: ${failed} ta`);
    delete userStates[userId];
    delete advData[userId];
});

// Bekor qilish
bot.action("cancel_adv_text", async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ADMIN_ID || userStates[userId] !== "waiting_for_text_confirm") {
        return ctx.answerCbQuery("❌ Ruxsat yo'q yoki amal muddati o'tgan.");
    }

    await ctx.answerCbQuery("Bekor qilindi.");
    await ctx.reply("❌ Reklama yuborish bekor qilindi.");
    delete userStates[userId];
    delete advData[userId];
});


bot.action("cancel_adv", async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== ADMIN_ID || userStates[userId] !== "waiting_for_confirmation") {
        return ctx.answerCbQuery("❌ Ruxsat berilmagan yoki amal tugagan.");
    }
    // Bekor qilindi:
    await ctx.answerCbQuery("Reklama bekor qilindi.");
    await ctx.reply("❌ Reklama yuborish bekor qilindi.");
    delete userStates[userId];
    delete advData[userId];
});

// Botni ishga tushiramiz
bot.launch();
console.log("🚀 Bot ishga tushdi!");
