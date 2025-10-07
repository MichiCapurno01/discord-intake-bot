const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

// Bot Configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Create Express server for Render health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: client.user ? client.user.tag : 'Starting...',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        botReady: client.isReady(),
        timestamp: new Date().toISOString() 
    });
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

// Slash Command Definition
const searchAdsCommand = new SlashCommandBuilder()
    .setName('search_ads')
    .setDescription('Search for Meta/Facebook ads with filters');

// Register Slash Commands
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    
    try {
        console.log('🔄 Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: [searchAdsCommand.toJSON()] }
        );
        
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

// Bot Ready Event
client.once('ready', () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    registerCommands();
});

// Handle Slash Command Interactions
client.on('interactionCreate', async (interaction) => {
    try {
        // Handle Slash Command: /search_ads
        if (interaction.isChatInputCommand() && interaction.commandName === 'search_ads') {
            await handleSearchAdsCommand(interaction);
        }
        
        // Handle Modal Submit
        if (interaction.isModalSubmit() && interaction.customId === 'searchAdsModal') {
            await handleModalSubmit(interaction);
        }
        
        // Handle Select Menu (Media Type)
        if (interaction.isStringSelectMenu() && interaction.customId === 'mediaTypeSelect') {
            await handleMediaTypeSelect(interaction);
        }
        
        // Handle Select Menu (Ad Status)
        if (interaction.isStringSelectMenu() && interaction.customId === 'adStatusSelect') {
            await handleAdStatusSelect(interaction);
        }
    } catch (error) {
        console.error('❌ Error handling interaction:', error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
});

// Store temporary user selections
const userSelections = new Map();

// Handle /search_ads Command - Show Modal
async function handleSearchAdsCommand(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('searchAdsModal')
        .setTitle('🔍 Search Meta Ads');

    // Text Input for Search Query
    const searchInput = new TextInputBuilder()
        .setCustomId('searchQuery')
        .setLabel('What ads are you looking for?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., fitness products, food delivery, etc.')
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(100);

    const searchRow = new ActionRowBuilder().addComponents(searchInput);
    modal.addComponents(searchRow);

    await interaction.showModal(modal);
}

// Handle Modal Submit - Show Selection Menus
async function handleModalSubmit(interaction) {
    const searchQuery = interaction.fields.getTextInputValue('searchQuery');
    
    // Initialize user selections
    userSelections.set(interaction.user.id, {
        searchQuery,
        mediaType: null,
        adStatus: null
    });

    // Create Media Type Select Menu
    const mediaTypeMenu = new StringSelectMenuBuilder()
        .setCustomId('mediaTypeSelect')
        .setPlaceholder('Select Media Type')
        .addOptions([
            {
                label: 'All Media Types',
                description: 'Include all ad formats',
                value: 'ALL',
                emoji: '📱'
            },
            {
                label: 'Image Ads',
                description: 'Only image-based ads',
                value: 'IMAGE',
                emoji: '🖼️'
            },
            {
                label: 'Video Ads',
                description: 'Only video-based ads',
                value: 'VIDEO',
                emoji: '🎥'
            }
        ]);

    // Create Ad Status Select Menu
    const adStatusMenu = new StringSelectMenuBuilder()
        .setCustomId('adStatusSelect')
        .setPlaceholder('Select Ad Status')
        .addOptions([
            {
                label: 'All Statuses',
                description: 'Show both active and inactive ads',
                value: 'ALL',
                emoji: '🔄'
            },
            {
                label: 'Active Only',
                description: 'Only currently running ads',
                value: 'ACTIVE',
                emoji: '✅'
            },
            {
                label: 'Inactive Only',
                description: 'Ads that are no longer running',
                value: 'INACTIVE',
                emoji: '⏸️'
            }
        ]);

    const mediaTypeRow = new ActionRowBuilder().addComponents(mediaTypeMenu);
    const adStatusRow = new ActionRowBuilder().addComponents(adStatusMenu);

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔍 Ad Search Configuration')
        .setDescription(`**Search Query:** ${searchQuery}\n\nPlease select your filters below:`)
        .addFields(
            { name: '📊 Media Type', value: '⏳ Waiting for selection...', inline: true },
            { name: '📈 Ad Status', value: '⏳ Waiting for selection...', inline: true }
        )
        .setFooter({ text: 'Select both options to submit your search' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        components: [mediaTypeRow, adStatusRow],
        ephemeral: true
    });
}

// Handle Media Type Selection
async function handleMediaTypeSelect(interaction) {
    const selection = userSelections.get(interaction.user.id);
    if (!selection) {
        await interaction.reply({ content: '❌ Session expired. Please run /search_ads again.', ephemeral: true });
        return;
    }

    selection.mediaType = interaction.values[0];
    userSelections.set(interaction.user.id, selection);

    // Update the embed
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields(
            { name: '📊 Media Type', value: `✅ ${interaction.values[0]}`, inline: true },
            { name: '📈 Ad Status', value: selection.adStatus ? `✅ ${selection.adStatus}` : '⏳ Waiting for selection...', inline: true }
        );

    await interaction.update({ embeds: [updatedEmbed] });

    // If both selections are made, submit to n8n
    if (selection.mediaType && selection.adStatus) {
        await submitToN8N(interaction, selection);
    }
}

// Handle Ad Status Selection
async function handleAdStatusSelect(interaction) {
    const selection = userSelections.get(interaction.user.id);
    if (!selection) {
        await interaction.reply({ content: '❌ Session expired. Please run /search_ads again.', ephemeral: true });
        return;
    }

    selection.adStatus = interaction.values[0];
    userSelections.set(interaction.user.id, selection);

    // Update the embed
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields(
            { name: '📊 Media Type', value: selection.mediaType ? `✅ ${selection.mediaType}` : '⏳ Waiting for selection...', inline: true },
            { name: '📈 Ad Status', value: `✅ ${interaction.values[0]}`, inline: true }
        );

    await interaction.update({ embeds: [updatedEmbed] });

    // If both selections are made, submit to n8n
    if (selection.mediaType && selection.adStatus) {
        await submitToN8N(interaction, selection);
    }
}

// Submit Data to n8n Webhook
async function submitToN8N(interaction, selection) {
    try {
        // Show loading state
        const loadingEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🔄 Processing Your Request...')
            .setDescription('Searching Meta Ad Library...')
            .setTimestamp();

        await interaction.followUp({ embeds: [loadingEmbed], ephemeral: true });

        // Send data to n8n
        const response = await axios.post(N8N_WEBHOOK_URL, {
            searchQuery: selection.searchQuery,
            mediaType: selection.mediaType,
            adStatus: selection.adStatus,
            userId: interaction.user.id,
            username: interaction.user.username,
            timestamp: new Date().toISOString()
        }, {
            timeout: 30000 // 30 second timeout
        });

        // Show success message with results
        const successEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Search Complete!')
            .setDescription(`Found ads matching your criteria`)
            .addFields(
                { name: '🔍 Search Query', value: selection.searchQuery, inline: false },
                { name: '📊 Media Type', value: selection.mediaType, inline: true },
                { name: '📈 Ad Status', value: selection.adStatus, inline: true }
            )
            .setFooter({ text: 'Results are being processed by n8n' })
            .setTimestamp();

        // Add response data if available
        if (response.data) {
            if (response.data.count !== undefined) {
                successEmbed.addFields({ name: '📈 Results Found', value: `${response.data.count} ads`, inline: true });
            }
            if (response.data.message) {
                successEmbed.setDescription(response.data.message);
            }
        }

        await interaction.followUp({ embeds: [successEmbed], ephemeral: true });

        // Clean up user selections
        userSelections.delete(interaction.user.id);

    } catch (error) {
        console.error('❌ Error submitting to n8n:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Search Failed')
            .setDescription('Failed to process your request. Please try again.')
            .addFields({
                name: 'Error Details',
                value: error.response?.data?.message || error.message || 'Unknown error'
            })
            .setTimestamp();

        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    }
}

// Login to Discord
client.login(TOKEN);
