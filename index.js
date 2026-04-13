// ===== IMPORTS =====
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const { WebcastPushConnection } = require("tiktok-live-connector");

// ===== ENV =====
const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  VERIFY_CHANNEL_ID,
  RULES_CHANNEL_ID,
  LOG_CHANNEL_ID,
  TIKTOK_USERNAME,
  TIKTOK_CHANNEL_ID,
  SAKURA_ROLE_ID,
  STRAWBERRY_ROLE_ID,
  MATCHA_ROLE_ID,
  MYSTIC_ROLE_ID,
  TARO_ROLE_ID
} = process.env;

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ===== THEME =====
const COLORS = {
  pink: 0xffb6d9,
  rose: 0xff8fb1,
  purple: 0xc8a2ff,
  mint: 0xb8f2d6,
  blue: 0xbfdcff,
  red: 0xff8a8a,
  yellow: 0xffe59a,
  gray: 0xcfcfcf
};

const FOOTER = {
  text: "mochi bot ♡ pastel server system"
};

// ===== DATA =====
const dataDir = path.join(__dirname, "data");
const configPath = path.join(dataDir, "config.json");
let config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf8"))
  : { verifyMessageId: null };

function saveConfig() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function validateEnv() {
  const requiredVars = [
    "TOKEN",
    "CLIENT_ID",
    "GUILD_ID",
    "VERIFY_CHANNEL_ID"
  ];

  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function resolveVerifyMessageId() {
  if (config.verifyMessageId) return config.verifyMessageId;
  if (!VERIFY_CHANNEL_ID) return null;

  try {
    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);
    if (!channel?.messages?.fetch) return null;

    const messages = await channel.messages.fetch({ limit: 25 });
    const verifyMessage = messages.find(message =>
      message.author?.id === client.user.id &&
      message.embeds?.some(embed =>
        typeof embed.title === "string" &&
        embed.title.toLowerCase().includes("welcome to the mochi garden")
      )
    );

    if (!verifyMessage) return null;

    config.verifyMessageId = verifyMessage.id;
    saveConfig();
    return verifyMessage.id;
  } catch (err) {
    console.error("Failed to resolve verify message:", err.message);
    return null;
  }
}

// ===== ROLES =====
const MOCHI_ROLES = {
  "🌸": { id: SAKURA_ROLE_ID, name: "Sakura" },
  "🍓": { id: STRAWBERRY_ROLE_ID, name: "Strawberry Milk" },
  "🍵": { id: MATCHA_ROLE_ID, name: "Matcha Dream" },
  "🫐": { id: MYSTIC_ROLE_ID, name: "Mystic Berry" },
  "💜": { id: TARO_ROLE_ID, name: "Taro Cloud" }
};

const ALL_ROLES = Object.values(MOCHI_ROLES)
  .map(r => r.id)
  .filter(Boolean);

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName("setupverify")
    .setDescription("Create the cute verify menu")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setuprules")
    .setDescription("Post the cute server rules")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("unlockdown")
    .setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send a styled announcement")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o =>
      o.setName("message").setDescription("Announcement text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Send a DM to a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("user").setDescription("User to DM").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("message").setDescription("Message text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages in bulk")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o =>
      o.setName("amount").setDescription("How many messages to delete").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View user info")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverstats")
    .setDescription("View server stats")
].map(c => c.toJSON());

// ===== TIKTOK STATE =====
let tiktokConnection = null;
let reconnectTimeout = null;
let wasLive = false;

// ===== HELPERS =====
async function safeSend(channelId, payload) {
  try {
    if (!channelId) return;
    const ch = await client.channels.fetch(channelId);
    if (!ch) return;
    await ch.send(payload);
  } catch (err) {
    console.error("Failed to send message:", err.message);
  }
}

function scheduleTikTokReconnect() {
  if (reconnectTimeout) return;

  console.log("Retrying TikTok connection in 60 seconds...");

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    startTikTokLive();
  }, 60000);
}

function makeEmbed({ title, description, color = COLORS.pink, fields = [], thumbnail = null }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter(FOOTER)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

async function logEmbed(embed) {
  try {
    if (!LOG_CHANNEL_ID) return;
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!ch) return;
    await ch.send({ embeds: [embed] });
  } catch (err) {
    console.error("Log send error:", err.message);
  }
}

async function startTikTokLive() {
  if (!TIKTOK_USERNAME || !TIKTOK_CHANNEL_ID) {
    console.log("TikTok LIVE not configured.");
    return;
  }

  try {
    console.log(`Trying TikTok LIVE connection for @${TIKTOK_USERNAME}...`);

    tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);
    await tiktokConnection.connect();

    console.log(`Connected to TikTok LIVE for @${TIKTOK_USERNAME}`);

    if (!wasLive) {
      wasLive = true;

      const liveEmbed = makeEmbed({
        title: "🎀 TikTok LIVE started",
        description:
          `**@${TIKTOK_USERNAME}** is live right now ♡\n\n` +
          `Come join the stream here:\n` +
          `https://tiktok.com/@${TIKTOK_USERNAME}/live`,
        color: COLORS.rose
      });

      await safeSend(TIKTOK_CHANNEL_ID, { embeds: [liveEmbed] });
    }

    tiktokConnection.on("streamEnd", async () => {
      console.log(`TikTok stream ended for @${TIKTOK_USERNAME}`);
      wasLive = false;

      const endEmbed = makeEmbed({
        title: "🌙 TikTok LIVE ended",
        description: `@${TIKTOK_USERNAME}'s stream has ended. Thanks for hanging out ♡`,
        color: COLORS.purple
      });

      await safeSend(TIKTOK_CHANNEL_ID, { embeds: [endEmbed] });
      scheduleTikTokReconnect();
    });

    tiktokConnection.on("disconnected", async () => {
      console.log(`TikTok disconnected for @${TIKTOK_USERNAME}`);
      wasLive = false;
      scheduleTikTokReconnect();
    });
  } catch (err) {
    console.log(`TikTok user offline or unavailable: ${err.message}`);
    wasLive = false;
    scheduleTikTokReconnect();
  }
}

// ===== REGISTER =====
client.once("clientReady", async () => {
  try {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands
    });

    console.log("Slash commands registered.");
    await resolveVerifyMessageId();
    startTikTokLive();
  } catch (err) {
    console.error("Ready error:", err);
  }
});

// ===== VERIFY =====
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const verifyMessageId = await resolveVerifyMessageId();
    if (!verifyMessageId || reaction.message.id !== verifyMessageId) return;

    const roleData = MOCHI_ROLES[reaction.emoji.name];
    if (!roleData?.id) return;

    const member = await reaction.message.guild.members.fetch(user.id);

    await member.roles.remove(ALL_ROLES.filter(r => r !== roleData.id));
    await member.roles.add(roleData.id);

    const embed = makeEmbed({
      title: "✨ Role selected",
      description: `${user} received **${roleData.name}** ${reaction.emoji.name}`,
      color: COLORS.mint
    });

    await logEmbed(embed);
  } catch (err) {
    console.error("Reaction add error:", err);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const verifyMessageId = await resolveVerifyMessageId();
    if (!verifyMessageId || reaction.message.id !== verifyMessageId) return;

    const roleData = MOCHI_ROLES[reaction.emoji.name];
    if (!roleData?.id) return;

    const member = await reaction.message.guild.members.fetch(user.id);

    if (member.roles.cache.has(roleData.id)) {
      await member.roles.remove(roleData.id);

      const embed = makeEmbed({
        title: "💫 Role removed",
        description: `${user} removed **${roleData.name}** ${reaction.emoji.name}`,
        color: COLORS.yellow
      });

      await logEmbed(embed);
    }
  } catch (err) {
    console.error("Reaction remove error:", err);
  }
});

// ===== COMMAND HANDLER =====
client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const channel = interaction.channel;
    const guild = interaction.guild;

    if (interaction.commandName === "setupverify") {
      await interaction.deferReply({ ephemeral: true });

      const ch = await client.channels.fetch(VERIFY_CHANNEL_ID);

      const verifyEmbed = makeEmbed({
        title: "૮ ˶ᵔ ᵕ ᵔ˶ ა welcome to the mochi garden",
        description:
          "Pick **one flavor role** by reacting below to unlock your vibe ♡\n\n" +
          "🌸 **Sakura**\n" +
          "🍓 **Strawberry Milk**\n" +
          "🍵 **Matcha Dream**\n" +
          "🫐 **Mystic Berry**\n" +
          "💜 **Taro Cloud**\n\n" +
          "You can change your role anytime by switching your reaction.",
        color: COLORS.pink
      });

      const msg = await ch.send({ embeds: [verifyEmbed] });

      for (const e of Object.keys(MOCHI_ROLES)) {
        await msg.react(e);
      }

      config.verifyMessageId = msg.id;
      saveConfig();

      return interaction.editReply("Cute verify menu created ♡");
    }

    if (interaction.commandName === "setuprules") {
      const ch = await client.channels.fetch(RULES_CHANNEL_ID);

      const rulesEmbed = makeEmbed({
        title: "📜 server rules",
        description:
          "Please keep everything comfy, safe, and fun for everyone ♡",
        color: COLORS.purple,
        fields: [
          { name: "1", value: "Be kind and respectful to everyone.", inline: false },
          { name: "2", value: "No spam, harassment, or drama.", inline: false },
          { name: "3", value: "Follow Discord ToS at all times.", inline: false },
          { name: "4", value: "Use channels for their correct purpose.", inline: false },
          { name: "5", value: `Please verify in <#${VERIFY_CHANNEL_ID}> to access the server.`, inline: false }
        ]
      });

      await ch.send({ embeds: [rulesEmbed] });
      return interaction.reply({ content: "Cute rules posted ♡", ephemeral: true });
    }

    if (interaction.commandName === "lockdown") {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false
      });

      const embed = makeEmbed({
        title: "🔒 channel locked",
        description: "This channel has been placed into lockdown by staff.",
        color: COLORS.red
      });

      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: "Channel locked.", ephemeral: true });
    }

    if (interaction.commandName === "unlockdown") {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null
      });

      const embed = makeEmbed({
        title: "🔓 channel unlocked",
        description: "This channel is open again. Please keep it comfy ♡",
        color: COLORS.mint
      });

      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: "Channel unlocked.", ephemeral: true });
    }

    if (interaction.commandName === "announce") {
      const msg = interaction.options.getString("message");

      const embed = makeEmbed({
        title: "📢 announcement",
        description: msg,
        color: COLORS.blue
      });

      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: "Announcement sent ♡", ephemeral: true });
    }

    if (interaction.commandName === "dm") {
      const user = interaction.options.getUser("user");
      const msg = interaction.options.getString("message");

      const dmEmbed = makeEmbed({
        title: "💌 message from staff",
        description: msg,
        color: COLORS.pink
      });

      await user.send({ embeds: [dmEmbed] }).catch(() => {});
      return interaction.reply({ content: "DM sent ♡", ephemeral: true });
    }

    if (interaction.commandName === "purge") {
      const amount = interaction.options.getInteger("amount");

      if (amount < 1 || amount > 100) {
        return interaction.reply({
          content: "Choose a number from 1 to 100.",
          ephemeral: true
        });
      }

      await channel.bulkDelete(amount, true);

      return interaction.reply({
        content: `Deleted ${amount} message(s).`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "userinfo") {
      const user = interaction.options.getUser("user");
      const member = await guild.members.fetch(user.id);

      const embed = makeEmbed({
        title: "👤 user info",
        description: `${user}`,
        color: COLORS.purple,
        thumbnail: user.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: "Tag", value: user.tag, inline: true },
          { name: "ID", value: user.id, inline: true },
          {
            name: "Joined Server",
            value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : "Unknown",
            inline: false
          },
          {
            name: "Account Created",
            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
            inline: false
          }
        ]
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === "serverstats") {
      const embed = makeEmbed({
        title: "📊 server stats",
        description: "A quick look at the server ♡",
        color: COLORS.mint,
        fields: [
          { name: "Server Name", value: guild.name, inline: true },
          { name: "Members", value: `${guild.memberCount}`, inline: true },
          { name: "Channels", value: `${guild.channels.cache.size}`, inline: true },
          { name: "Roles", value: `${guild.roles.cache.size}`, inline: true }
        ],
        thumbnail: guild.iconURL({ dynamic: true })
      });

      return interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Interaction error:", err);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("There was an error.").catch(() => {});
    } else {
      await interaction.reply({
        content: "There was an error.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ===== LOGGING =====
client.on("messageDelete", async msg => {
  try {
    if (!msg || msg.author?.bot) return;

    const embed = makeEmbed({
      title: "🗑️ message deleted",
      description: msg.content ? msg.content : "*No text content*",
      color: COLORS.red,
      fields: [
        { name: "Author", value: `${msg.author ? msg.author.tag : "Unknown"}`, inline: true },
        { name: "Channel", value: `${msg.channel}`, inline: true }
      ]
    });

    await logEmbed(embed);
  } catch (err) {
    console.error("Delete log error:", err);
  }
});

client.on("messageUpdate", async (oldMsg, newMsg) => {
  try {
    if (!oldMsg || !newMsg) return;
    if (oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;

    const embed = makeEmbed({
      title: "✏️ message edited",
      description: "A message was updated.",
      color: COLORS.yellow,
      fields: [
        { name: "Author", value: `${oldMsg.author ? oldMsg.author.tag : "Unknown"}`, inline: true },
        { name: "Channel", value: `${oldMsg.channel}`, inline: true },
        { name: "Before", value: oldMsg.content?.slice(0, 1024) || "*No text*", inline: false },
        { name: "After", value: newMsg.content?.slice(0, 1024) || "*No text*", inline: false }
      ]
    });

    await logEmbed(embed);
  } catch (err) {
    console.error("Update log error:", err);
  }
});

// ===== WELCOME =====
client.on("guildMemberAdd", async member => {
  try {
    const welcomeEmbed = makeEmbed({
      title: "🌸 welcome to the server",
      description:
        `Hi ${member.user.username} ♡\n\n` +
        `We’re happy you joined!\n` +
        `Please head to <#${VERIFY_CHANNEL_ID}> to verify and unlock the server.\n\n` +
        `Have fun and enjoy your stay ✨`,
      color: COLORS.pink,
      thumbnail: member.user.displayAvatarURL({ dynamic: true })
    });

    await member.send({ embeds: [welcomeEmbed] }).catch(() => {});

    const log = makeEmbed({
      title: "👋 member joined",
      description: `${member.user.tag} joined the server.`,
      color: COLORS.mint,
      thumbnail: member.user.displayAvatarURL({ dynamic: true })
    });

    await logEmbed(log);
  } catch (err) {
    console.error("Welcome error:", err);
  }
});

// ===== START =====
try {
  validateEnv();
  client.login(TOKEN);
} catch (err) {
  console.error("Startup error:", err.message);
  process.exit(1);
}
