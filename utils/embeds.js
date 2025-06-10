const Discord = require('discord.js');

function replacePlaceholders(text, replacements = {}) {
  if (typeof text !== 'string') return text;
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`{${key}}`, 'g');
    text = text.replace(regex, value);
  }
  return text;
}

function buildEmbed(embedData, replacements = {}) {
  const embed = new Discord.EmbedBuilder();

  if (embedData.title) embed.setTitle(replacePlaceholders(embedData.title, replacements));
  if (embedData.description) embed.setDescription(replacePlaceholders(embedData.description, replacements));
  if (embedData.color) embed.setColor(embedData.color);
  if (embedData.timestamp) embed.setTimestamp(new Date());
  if (embedData.url) embed.setURL(embedData.url);

  if (embedData.author) {
    embed.setAuthor({
      name: replacePlaceholders(embedData.author.name, replacements),
      url: embedData.author.url || null,
      iconURL: embedData.author.icon_url || null,
    });
  }

  if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail.url);
  if (embedData.image) embed.setImage(embedData.image.url);

  if (embedData.footer) {
    embed.setFooter({
      text: replacePlaceholders(embedData.footer.text, replacements),
      iconURL: embedData.footer.icon_url || null,
    });
  }

  if (embedData.fields) {
    embed.addFields(
      embedData.fields.map(field => ({
        name: replacePlaceholders(field.name, replacements),
        value: replacePlaceholders(field.value, replacements),
        inline: field.inline || false,
      }))
    );
  }

  return embed;
}

async function sendEmbeds(target, embedsArray, reply = false) {
  // embedsArray = array of embed JS objects already built
  if ('reply' in target && reply) {
    await target.reply({ embeds: embedsArray });
  } else if ('channel' in target) {
    await target.channel.send({ embeds: embedsArray });
  } else {
    // fallback: if target is a channel-like object
    await target.send({ embeds: embedsArray });
  }
}

module.exports = {
  buildEmbed,
  sendEmbeds,
};
