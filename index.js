const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder,
    ButtonStyle,
    ChannelType, 
    PermissionsBitField, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ]
});

client.once('ready', async () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('ticket-kurulum')
                .setDescription('Ballas destek panelini belirlenen kanala gönderir.')
                .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

            new SlashCommandBuilder()
                .setName('ticket-kapat')
                .setDescription('Bulunduğunuz açık destek talebini kapatır ve arşive taşır.'),

            new SlashCommandBuilder()
                .setName('ticket-ekle')
                .setDescription('Açık olan tickete başka bir kullanıcı ekler.')
                .addUserOption(option => 
                    option
                        .setName('kullanici')
                        .setDescription('Eklenecek kullanıcı')
                        .setRequired(true)
                ),

            new SlashCommandBuilder()
                .setName('ticket-cikar')
                .setDescription('Ticket içindeki bir kullanıcının erişimini kaldırır.')
                .addUserOption(option => 
                    option
                        .setName('kullanici')
                        .setDescription('Çıkarılacak kullanıcı')
                        .setRequired(true)
                )

        ];

        await rest.put(
            Routes.applicationGuildCommands(
                client.user.id,
                process.env.SUNUCU_ID
            ),
            {
                body: commands.map(c => c.toJSON())
            }
        );

        console.log('Slash komutları başarıyla yüklendi.');

    } catch (error) {
        console.error('Komutlar yüklenirken hata oluştu:', error);
    }
});


// ======================================================
// TİCKET VE DÜELLO KOMUT YÖNETİCİSİ
// ======================================================

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    const {
        commandName,
        channel,
        guild,
        member,
        user
    } = interaction;


    // ==================================================
    // TİCKET KURULUM
    // ==================================================

    if (commandName === 'ticket-kurulum') {

        const targetChannelId = process.env.Ticket_Channel;
        const targetChannel = guild.channels.cache.get(targetChannelId);

        if (!targetChannel) {
            return interaction.reply({
                content: '`.env` dosyasında belirttiğiniz `Ticket_Channel` ID\'si geçersiz!',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('💚 Grove GanG Ticket Sistemi')
            .setDescription(
                '💡 Aşağıdaki seçeneklerden uygun olanı seçip ticket konunuzu belirtebilir ve ticket açabilirsiniz.\n\n' +
                '⚡ Ticket açmadan önce kuralları okumayı ihmal etmeyin.'
            )
            .setImage(
                'https://media.discordapp.net/attachments/1492485975862153277/1544464870710321234/oc_ithan.png?ex=6ab0fe3f&is=6aafacbf&hm=844931737dae096f2ea1d3650bfcbc6d6aff5d7d3642bc9b0d05868efdc04c2f&=&format=webp&quality=lossless&width=1024&height=1024'
            )
            .setColor(0x00A63C)
            .setFooter({
                text: 'Grove • #PRIMYOK '
            });

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_menu')
                    .setPlaceholder('Bir ticket kategorisi seçin')
                    .addOptions([
                        {
                            label: 'Şikayet',
                            description: 'Kullanıcı veya yetkili şikayetleri',
                            value: 'sikayet',
                            emoji: '🚨'
                        },
                        {
                            label: 'Mazeret',
                            description: 'Mazeret bildirimleri ve izin talepleri',
                            value: 'mazeret',
                            emoji: '📋'
                        },
                                  {
                            label: 'Diğer',
                            description: 'Diğer bildirimler ve izin talepleri',
                            value: 'Diğer',
                            emoji: '⟳'
                        },
                        {
                            label: 'Seçimi Sıfırla',
                            description: 'Menü seçimini sıfırlar',
                            value: 'reset_selection',
                            emoji: '🗑️'
                        }
                    ])
            );

        await targetChannel.send({
            embeds: [embed],
            components: [row]
        });

        await interaction.reply({
            content: `Grove StreeT destek paneli başarıyla <#${targetChannelId}> kanalına gönderildi!`,
            ephemeral: true
        });
    }


    // ==================================================
    // TİCKET İÇİ YÖNETİM KOMUTLARI
    // ==================================================

    const isTicketChannel =
        channel.name &&
        (
            channel.name.startsWith('şikayet-') ||
            channel.name.startsWith('mazeret-')
            channel.name.startsWith('Diğer-')
        );


    // TICKET KAPAT
    if (commandName === 'ticket-kapat') {

        if (!isTicketChannel) {
            return interaction.reply({
                content: 'Bu komut sadece aktif bir destek kanalında kullanılabilir!',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: 'Destek talebi kapatılıyor...',
            ephemeral: true
        });

        await archiveTicket(channel, guild, user);
    }


    // TICKET EKLE
    if (commandName === 'ticket-ekle') {

        if (!isTicketChannel) {
            return interaction.reply({
                content: 'Bu komut sadece bir destek kanalında kullanılabilir!',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('kullanici');

        await channel.permissionOverwrites.create(
            targetUser,
            {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }
        );

        await interaction.reply({
            content: `${targetUser} başarıyla bu destek talebine eklendi.`
        });
    }


    // TICKET ÇIKAR
    if (commandName === 'ticket-cikar') {

        if (!isTicketChannel) {
            return interaction.reply({
                content: 'Bu komut sadece bir destek kanalında kullanılabilir!',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('kullanici');

        await channel.permissionOverwrites.delete(targetUser);

        await interaction.reply({
            content: `${targetUser} kullanıcısının bu destek talebine olan erişimi kaldırıldı.`
        });
    }

// ======================================================
// TİCKET MENÜ VE BUTON İŞLEMLERİ
// ======================================================

client.on('interactionCreate', async interaction => {

    // ==================================================
    // TICKET MENÜ
    // ==================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === 'ticket_menu'
    ) {

        const selectedValue = interaction.values[0];

        if (selectedValue === 'reset_selection') {
            return interaction.reply({
                content: 'Seçiminiz sıfırlandı.',
                ephemeral: true
            });
        }

        const guild = interaction.guild;
        const member = interaction.member;

        let categoryName = '';
        let channelPrefix = '';

        if (selectedValue === 'sikayet') {
            categoryName = 'Şikayet Ticketları';
            channelPrefix = 'şikayet';
        }

        else if (selectedValue === 'mazeret') {
            categoryName = 'Mazeret Ticketları';
            channelPrefix = 'mazeret';
        }

        await interaction.deferReply({
            ephemeral: true
        });

        try {

            let category = guild.channels.cache.get(
                process.env.Ticket
            );

            if (!category) {
                category = guild.channels.cache.find(
                    c =>
                        c.id === process.env.Ticket ||
                        c.name === categoryName
                );
            }


            // ==================================================
            // TICKET ROLE 2
            // Bu rol ticketları görebilecek.
            // ==================================================

            const ticketRole2 = process.env.TICKET_ROLE2;


            // ==================================================
            // TICKET KANALI
            // ==================================================

            const permissionOverwrites = [

                // @everyone göremez
                {
                    id: guild.id,
                    deny: [
                        PermissionsBitField.Flags.ViewChannel
                    ]
                },

                // Ticket sahibi görebilir
                {
                    id: member.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },

                // Bot görebilir
                {
                    id: client.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ];


            // ==================================================
            // TICKET_ROLE2 VARSA EKLE
            // ==================================================

            if (ticketRole2) {

                permissionOverwrites.push({
                    id: ticketRole2,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                });

            }


            const ticketChannel = await guild.channels.create({

                name: `${channelPrefix}-${member.user.username}`,

                type: ChannelType.GuildText,

                parent: category
                    ? category.id
                    : null,

                permissionOverwrites

            });


            // ==================================================
            // TICKET EMBED
            // ==================================================

            const ticketEmbed = new EmbedBuilder()
                .setTitle(`Grove StreeT Destek Talebi - ${categoryName}`)
                .setDescription(
                    `Merhaba ${member}, talebiniz alındı. Yetkili ekibimiz en kısa sürede ilgilenecektir.\n\n` +
                    `Aşağıdaki butonları kullanarak talebinizi yönetebilirsiniz.`
                )
                .setColor(0x2ECC71);


            const actionRow = new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Talebi Kapat')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔒'),

                    new ButtonBuilder()
                        .setCustomId('force_close')
                        .setLabel('Zorla Kapat (Yetkili)')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⚡'),

                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel('Talebi Üstlen')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🙋‍♂️')
                );


            // ==================================================
            // ROLLERİ PİNGLE
            // ==================================================

            const role1 = process.env.TICKET_ROLE1
                ? `<@&${process.env.TICKET_ROLE1}>`
                : '';

            const role2 = process.env.TICKET_ROLE2
                ? `<@&${process.env.TICKET_ROLE2}>`
                : '';

            const role3 = process.env.TICKET_ROLE3
                ? `<@&${process.env.TICKET_ROLE3}>`
                : ''

            const pingText =
               `${member} ${role1} ${role2} ${role3}`.trim();


            await ticketChannel.send({
                content: pingText,
                embeds: [ticketEmbed],
                components: [actionRow]
            });


            await interaction.editReply({
                content: `Destek talebiniz başarıyla oluşturuldu: ${ticketChannel}`
            });

        } catch (error) {

            console.error(error);

            await interaction.editReply({
                content: 'Kanal oluşturulurken hata oluştu.'
            });
        }
    }


    // ==================================================
    // BUTONLAR
    // ==================================================

    if (interaction.isButton()) {

        const {
            customId,
            channel,
            guild,
            user,
            member
        } = interaction;


        // TICKET KAPAT
        if (customId === 'close_ticket') {

            await interaction.reply({
                content: 'Destek talebi kapatılıyor...',
                ephemeral: true
            });

            await archiveTicket(
                channel,
                guild,
                user
            );
        }


        // ZORLA KAPAT
        if (customId === 'force_close') {

            const hasStaffRole = (roleEnv) =>
                roleEnv
                    ?.split(',')
                    .map(r => r.trim())
                    .some(r => member.roles.cache.has(r));


            if (
                !member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                ) &&
                !hasStaffRole(process.env.TICKET_ROLE1) &&
                !hasStaffRole(process.env.TICKET_ROLE2)
            ) {

                return interaction.reply({
                    content: 'Bu butonu kullanmak için yetkiniz yok!',
                    ephemeral: true
                });
            }


            await interaction.reply({
                content: `⚠️ Bu destek talebi bir yetkili (${user.tag}) tarafından **zorla kapatıldı**!`
            });

            await archiveTicket(
                channel,
                guild,
                user
            );
        }


        // CLAIM
        if (customId === 'claim_ticket') {

            await interaction.reply({
                content: `🙋‍♂️ Bu destek talebi **${user.tag}** adlı yetkili tarafından üstlenildi!`
            });
        }


        // DELETE
        if (customId === 'delete_ticket') {

            await interaction.reply({
                content: 'Kanal tamamen siliniyor...'
            });

            setTimeout(
                async () =>
                    await channel.delete().catch(() => {}),
                3000
            );
        }
    }
});


// ======================================================
// ORTAK ARŞİVLEME FONKSİYONU
// ======================================================

async function archiveTicket(channel, guild, closedBy) {

    try {

        const archiveCategory =
            guild.channels.cache.get(
                process.env.Ticket_2
            );


        await channel.setName(
            `kapatildi-${channel.name}`
        );


        if (archiveCategory) {
            await channel.setParent(
                archiveCategory.id
            );
        }


        // ==================================================
        // ARŞİVDE DE TICKET_ROLE2 GÖREBİLSİN
        // ==================================================

        const archivePermissions = [

            {
                id: guild.id,
                deny: [
                    PermissionsBitField.Flags.ViewChannel
                ]
            },

            {
                id: client.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            }
        ];


        if (process.env.TICKET_ROLE2) {

            archivePermissions.push({

                id: process.env.TICKET_ROLE2,

                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]

            });

        }


        await channel.permissionOverwrites.set(
            archivePermissions
        );


        const deleteRow =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId('delete_ticket')
                        .setLabel('Kanalı Tamamen Sil')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️')

                );


        await channel.send({

            content:
                `🔒 Bu destek talebi **${closedBy.tag}** tarafından kapatıldı ve arşivlendi.`,

            components: [deleteRow]

        });

    } catch (err) {

        console.error(err);

    }
}

// ======================================================
// BOTU BAŞLAT
// ======================================================

client.login(
    process.env.BOT_TOKEN
);
