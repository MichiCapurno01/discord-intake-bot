import { Client, GatewayIntentBits, Events } from 'discord.js';
import fetch from 'node-fetch';

const {
  DISCORD_TOKEN,
  N8N_WEBHOOK,
  CHANNEL_ID
} = process.env;

if (!DISCORD_TOKEN || !N8N_WEBHOOK || !CHANNEL_ID) {
  console.error('Missing env vars: DISCORD_TOKEN, N8N_WEBHOOK, CHANNEL_ID');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot) return;
    if (msg.channel.id !== CHANNEL_ID) return;

    const payload = {
      messageId: msg.id,
      content: msg.content,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        discriminator: msg.author.discriminator,
        displayName: msg.member?.displayName ?? msg.author.username
      },
      channelId: msg.channel.id,
      guildId: msg.guild?.id,
      attachments: [...msg.attachments.values()].map(a => ({
        id: a.id, name: a.name, url: a.url, contentType: a.contentType, size: a.size
      })),
      timestamp: msg.createdAt.toISOString()
    };

    const res = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('n8n webhook failed:', res.status, t);
    }
  } catch (err) {
    console.error('Error forwarding message to n8n:', err);
  }
});

client.login(DISCORD_TOKEN);
