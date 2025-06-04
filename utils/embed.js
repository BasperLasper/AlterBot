const { EmbedBuilder } = require('discord.js');
const YAML = require('yamljs');

const messages = YAML.load('./messages.yml');

function sendEmbed(message, key, replacements = {}, reply = false) {
  const embeds = messages[key];
  if (!embeds) {
    console.error(`Embed key "${key}" not found in messages.yml`);
    return;
  }

  embeds.forEach(embedData => {
    const embed = new EmbedBuilder();

    const replace = text => typeof text === 'string'
      ? Object.entries(replacements).reduce((acc, [k, v]) => acc.replace(new RegExp(`{${k}}`, 'g'), v), text)
      : text;

    if (embedData.title) embed.setTitle(replace(embedData.title));
    if (embedData.description) embed.setDescription(replace(embedData.description));
    if (embedData.color) embed.setColor(embedData.color);
    if (embedData.timestamp) embed.setTimestamp(new Date());
    if (embedData.url) embed.setURL(embedData.url);

    if (embedData.author) embed.setAuthor({
      name: replace(embedData.author.name),
      iconURL: embedData.author.icon_url || null,
      url: embedData.author.url || null,
    });

    if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail.url);
    if (embedData.image) embed.setImage(embedData.image.url);

    if (embedData.footer) embed.setFooter({
      text: replace(embedData.footer.text),
      iconURL: embedData.footer.icon_url || null,
    });

    if (embedData.fields) {
      embed.addFields(embedData.fields.map(field => ({
        name: replace(field.name),
        value: replace(field.value),
        inline: field.inline || false,
      })));
    }

    if (reply) message.reply({ embeds: [embed] });
    else message.channel.send({ embeds: [embed] });
  });
}

module.exports = { sendEmbed };
