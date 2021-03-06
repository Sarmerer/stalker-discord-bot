const {
  getMentionedUsers,
  reply,
  respond,
  getFlagValue,
  updateStat,
  getStalkersCount,
  getChannelFromMention,
  addGuildToDB,
} = require("../utils");
const { prefix, default_throttle } = require("../config.json");
const { log } = require("../logger");
const { client } = require("../client");
const strings = require("../strings");

module.exports = {
  name: "stalk",
  description: "start getting notifications, about user presence status",
  usage: `Usage: \`${prefix}stalk @someone\`. Call \`${prefix}help stalk\` for more details.`,
  needsArgs: true,
  arguments: {
    required: ["@someone... - user(s)/bot(s) which presence you want to stalk"],
    optional: [
      "dnd -  do not disturb mode, you won't be getting notifications when you are offline or dnd",
      "notag - no tag mode, bot won't tag you in notifications",
    ],
  },
  flags: {
    mode: {
      default: "online",
      description: "select notifications mode",
      header: "variants: get notifications only when...",
      variants: {
        ooo: "user goes online or offline",
        any: "user goes to any status",
        offline: "user goes offline",
        online: "user goes online",
        idle: "user goes idle",
        dnd: "user goes dnd",
      },
      aliases: ["-m", "--mode"],
    },
    debounce: {
      default: 30,
      description:
        "set time (seconds), that should pass, before a next notification",
      aliases: ["-t", "--timeout", "--time"],
    },
    channel: {
      default: "system channel, or a channel set by server's owner",
      description: "override default notifications channel",
      aliases: ["-c", "--chan", "--channel"],
    },
  },
  examples: {
    valid: [
      `${prefix}stalk @Sobuck -m offline dnd`,
      `${prefix}stalk @Bot @Bot1 @Bot2 -mode all -c #bots`,
      `${prefix}stalk @Someone`,
    ],
    invalid: [
      `${prefix}stalk Sobuck -m`,
      `${prefix}stalk @Bot,@Bot1 -mode all`,
      `${prefix}stalk @Someone -chnl not-exists`,
    ],
  },

  execute(message, args, flags) {
    let members = getMentionedUsers(message);
    if (!members.length) return reply(message, this.usage);

    const mode = getFlagValue(this.flags.mode.aliases, flags, "online");
    let modeVariants = Object.keys(this.flags.mode.variants);
    if (!modeVariants.includes(mode)) {
      let variants = modeVariants.join(", ");
      return reply(
        message,
        `mode \`${mode}\` is invalid, available modes: \`${variants}\``
      );
    }

    const debounce = Number.parseInt(
      getFlagValue(this.flags.debounce.aliases, flags, 30)
    );

    if (debounce < default_throttle)
      return reply(
        message,
        `timeout should be a number, and can't be less than ${default_throttle} seconds`
      );

    let channel;
    const channelMention = getFlagValue(this.flags.channel.aliases, flags);
    if (channelMention) {
      let channelFromMention = getChannelFromMention(message, channelMention);
      if (!channelFromMention)
        return reply(message, `channel you have mentioned does not exist`);
      channel = channelFromMention?.id;
    } else {
      let guild = global.db
        .get("guilds")
        .find({ id: message?.guild?.id })
        .value();
      if (!guild) {
        guild = addGuildToDB(message.guild);
        log(
          `created guild record in db${
            message.guild?.name
              ? ` | On server: [${message.guild?.name} - ${message.guild?.id}]`
              : ""
          }`
        );
      }
      if (!guild?.channel) {
        client.users.cache
          .get(message.guild.ownerID)
          .send(strings.channelMissing);
        reply(
          message,
          "there is no notificaions channel on this server, use a `--channel` flag to override default channel"
        );
        return;
      }
      channel = guild.channel;
    }
    const notag = args.includes("notag");
    const dnd = args.includes("dnd");
    const d = new Date();
    const lastNotification = d.setSeconds(d.getSeconds() - debounce);
    let targets = [];

    for (let member of members) {
      if (member.id == message.author.id) continue;

      var alreadyStalking = global.db
        .get("stalkers")
        .filter((s) => s.id == message.author.id && s.target == member.id)
        .value();
      if (alreadyStalking.length != 0) continue;

      let newStalker = {
        id: message.author.id,
        target: member.id,
        guildID: message.guild.id,
        channel: channel,
        debounce: debounce,
        mode: mode,
        notag: notag,
        dnd: dnd,
        last_notification: lastNotification,
      };

      global.db.get("stalkers").push(newStalker).write();
      targets.push(member.username);
    }

    if (!targets.length)
      return reply(message, `you already stalk everyone you have mentioned`);

    let stalker = message.author.username,
      stalked =
        targets.length <= 1
          ? `${targets.join("")}`
          : `${targets.slice(0, -1).join(", ")} and ${targets.slice(-1)}`;
    server = message?.guild?.name || undefined;

    respond(
      message,
      `${stalker} now stalks ${stalked}, notifications will be in <#${channel}> channel. Mode: \`${mode}\`${
        dnd ? ", `don't disturb` mode in on" : ""
      }${notag ? ", notag mode is on" : ""}`
    );

    updateStat("stalkers", getStalkersCount());
    log(`[${stalker}] has started stalking [${stalked}] on server [${server}]`);
  },
};
