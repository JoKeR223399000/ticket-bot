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

// Aktif düelloları tutmak için Map
const activeDuels = new Map();

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
                ),

            new SlashCommandBuilder()
                .setName('1vs1')
                .setDescription('Bir oyuncuya 1vs1 düello teklif eder.')
                .addUserOption(option => 
                    option
                        .setName('rakip')
                        .setDescription('Düello yapılacak kişi')
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
            .setTitle('💜 Ballas Ticket Sistemi')
            .setDescription(
                '💡 Aşağıdaki seçeneklerden uygun olanı seçip ticket konunuzu belirtebilir ve ticket açabilirsiniz.\n\n' +
                '⚡ Ticket açmadan önce kuralları okumayı ihmal etmeyin.'
            )
            .setImage(
                'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop'
            )
            .setColor(0x580099)
            .setFooter({
                text: 'Ballas • #PRIMYOK daha neresi olsun'
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
            content: `Ballas destek paneli başarıyla <#${targetChannelId}> kanalına gönderildi!`,
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


    // ==================================================
    // 1VS1
    // ==================================================

    if (commandName === '1vs1') {

        const opponent = interaction.options.getUser('rakip');
        const challenger = user;

        if (opponent.bot || opponent.id === challenger.id) {
            return interaction.reply({
                content: 'Kendine veya bir bota meydan okuyamazsın!',
                ephemeral: true
            });
        }

        const acceptRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('duel_accept')
                    .setLabel('Kabul Et')
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId('duel_reject')
                    .setLabel('Reddet')
                    .setStyle(ButtonStyle.Danger)
            );

        const msg = await interaction.reply({
            content: `${opponent}, ${challenger} sana bir 1vs1 düello teklif ediyor! Kabul ediyor musun?`,
            components: [acceptRow],
            fetchReply: true
        });

        const collector = msg.createMessageComponentCollector({
            time: 30000
        });

        collector.on('collect', async i => {

            if (i.user.id !== opponent.id) {
                return i.reply({
                    content: 'Bu teklif sana yapılmadı!',
                    ephemeral: true
                });
            }

            if (i.customId === 'duel_reject') {

                await i.update({
                    content: `${opponent} düello teklifini reddetti.`,
                    components: []
                });

                collector.stop();

            } else if (i.customId === 'duel_accept') {

                await i.update({
                    content: `Düello kabul edildi! Oyun başlıyor...`,
                    components: []
                });

                collector.stop();

                startDuel(
                    interaction.channel,
                    challenger,
                    opponent,
                    guild
                );
            }
        });
    }
});


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
                .setTitle(`Ballas Destek Talebi - ${categoryName}`)
                .setDescription(
                    `Merhaba ${member}, talebiniz alındı. Yetkili ekibimiz en kısa sürede ilgilenecektir.\n\n` +
                    `Aşağıdaki butonları kullanarak talebinizi yönetebilirsiniz.`
                )
                .setColor(0x580099);


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

            const pingText =
                `${member} ${role1} ${role2}`.trim();


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
// DÜELLO OYUN LOGİĞİ
// ======================================================

client.on('messageCreate', async message => {

    if (message.author.bot) return;

    const channelId = message.channel.id;

    const duelData =
        activeDuels.get(channelId);

    if (!duelData) return;


    const currentId =
        duelData.players[duelData.turn];

    if (message.author.id !== currentId) return;


    const action =
        message.content.toLowerCase();

    const validActions = [
        'yumruk',
        'kalkan',
        'şifa',
        'ultra güç',
        'pas',
        'kaç'
    ];

    if (!validActions.includes(action)) return;


    try {

        const userMsg =
            await message.delete();

        duelData.messages.push(
            userMsg.id
        );

    } catch (err) {}


    const opponentId =
        duelData.players[1 - duelData.turn];

    const attacker =
        duelData.stats[currentId];

    const defender =
        duelData.stats[opponentId];

    let resultText = '';

    let turnChange = true;


    attacker.defending = false;


    const isBossRole =
        message.member &&
        process.env.BOSS_ROLE_ID &&
        message.member.roles.cache.has(
            process.env.BOSS_ROLE_ID
        );

    const isBossUser =
        message.author.id ===
        process.env.BOSS_USER_ID;

    const isBoss =
        isBossRole || isBossUser;


    if (action === 'kaç') {

        activeDuels.delete(channelId);

        await cleanupDuelMessages(
            message.channel,
            duelData
        );

        return message.channel.send(
            `🏳️ <@${currentId}> savaştan kaçtı! Kazanan: <@${opponentId}> 🎉`
        );

    }


    else if (action === 'pas') {

        const energyGain =
            isBoss ? 20 : 15;

        attacker.energy =
            Math.min(
                150,
                attacker.energy + energyGain
            );

        resultText =
            `💤 ${isBoss ? '👑 **[BOSS]** ' : ''}<@${currentId}> pas geçti ve **${energyGain}** enerji kazandı!`;

    }


    else if (action === 'yumruk') {

        if (attacker.energy < 5) {

            resultText =
                `❌ Yetersiz enerji! (5 Gerekli). Yumruk atılamadı!`;

            turnChange = false;

        } else {

            attacker.energy -= 5;

            let damage = 0;

            const rnd =
                Math.random() * 100;


            if (rnd < 40) {

                damage =
                    Math.floor(
                        Math.random() * (20 - 15 + 1)
                    ) + 15;

            }

            else if (rnd < 90) {

                damage =
                    Math.floor(
                        Math.random() * (40 - 20 + 1)
                    ) + 20;

            }

            else {

                damage =
                    Math.floor(
                        Math.random() * (70 - 60 + 1)
                    ) + 60;

            }


            if (defender.defending) {

                damage =
                    Math.floor(
                        damage / 2
                    );

                resultText =
                    `🥊 <@${currentId}> yumruk attı ancak rakip kalkanta olduğu için hasar yarıya indi: **${damage} hasar!** (5 enerji harcandı)`;

            } else {

                resultText =
                    `🥊 <@${currentId}> yumruk attı ve **${damage}** hasar vurdu! (5 enerji harcandı)`;

            }


            defender.hp -= damage;

            attacker.punchCount += 1;
        }
    }


    else if (action === 'kalkan') {

        if (attacker.energy < 25) {

            resultText =
                `❌ Yetersiz enerji! (25 Gerekli). Kalkan kurulamadı!`;

            turnChange = false;

        } else {

            attacker.energy -= 25;

            attacker.defending = true;

            resultText =
                `🛡️ <@${currentId}> kalkanını başarıyla kurdu! (Gelecek hasar %50 azalacak, 25 enerji harcandı).`;
        }
    }


    else if (action === 'şifa') {

        if (attacker.energy < 40) {

            resultText =
                `❌ Yetersiz enerji! (40 Gerekli). Şifa yapılamadı.`;

            turnChange = false;

        } else {

            attacker.energy -= 40;

            const healAmount =
                Math.floor(
                    Math.random() * (70 - 50 + 1)
                ) + 50;

            attacker.hp =
                Math.min(
                    500,
                    attacker.hp + healAmount
                );

            resultText =
                `✨ <@${currentId}> başarıyla şifa kullandı ve **+${healAmount}** can kazandı! (40 enerji harcandı)`;
        }
    }


    else if (action === 'ultra güç') {

        if (attacker.punchCount < 5) {

            resultText =
                `❌ Ultra güç kullanmak için en az **5 kez yumruk** atmış olmalısın! (Şu anki yumruk sayın: ${attacker.punchCount})`;

            turnChange = false;

        }

        else if (attacker.energy < 75) {

            resultText =
                `❌ Yetersiz enerji! (75 Gerekli). Ultra Güç denemesi başarısız oldu!`;

            turnChange = false;

        }

        else {

            attacker.energy -= 75;

            attacker.punchCount = 0;


            const ultraRnd =
                isBoss
                    ? 0
                    : Math.random() * 100;


            if (!isBoss && ultraRnd < 50) {

                resultText =
                    `💨 <@${currentId}> Ultra Güç açığa çıkardı ama kontrol edemedi ve saldırı boşa gitti! (75 enerji harcandı)`;

            }

            else {

                let ultraDamage =
                    Math.floor(
                        Math.random() * (200 - 100 + 1)
                    ) + 100;


                if (defender.defending) {

                    ultraDamage =
                        Math.floor(
                            ultraDamage / 2
                        );

                    resultText =
                        `⚡ ${isBoss ? '👑 **[BOSS]** ' : ''}Ultra Güç patlaması! Rakip kalkanda olduğu için hasar yarıya indi ama yine de **${ultraDamage}** devasa hasar vurdu! (75 enerji harcandı)`;

                } else {

                    resultText =
                        `⚡ ${isBoss ? '👑 **[BOSS]** ' : ''}Ultra Güç patlaması! <@${currentId}> rakibine **${ultraDamage}** devasa hasar vurdu! (75 enerji harcandı)`;
                }


                defender.hp -= ultraDamage;
            }
        }
    }


    const sentResMsg =
        await message.channel.send(
            resultText
        );

    duelData.messages.push(
        sentResMsg.id
    );


    if (defender.hp <= 0) {

        activeDuels.delete(channelId);

        await cleanupDuelMessages(
            message.channel,
            duelData
        );

        return message.channel.send(
            `🏆 <@${currentId}> rakibini alt etti! **Kazanan <@${currentId}>!** 🎉`
        );
    }


    if (attacker.hp <= 0) {

        activeDuels.delete(channelId);

        await cleanupDuelMessages(
            message.channel,
            duelData
        );

        return message.channel.send(
            `🏆 <@${opponentId}> kazandı! 🎉`
        );
    }


    if (turnChange) {

        duelData.turn =
            1 - duelData.turn;

    } else {

        const warnMsg =
            await message.channel.send(
                `⚠️ <@${currentId}> yeterli enerji olmadığı veya şart sağlanmadığı için sıranı kaybetmedin! Tekrar hamle yapabilirsin.`
            );

        duelData.messages.push(
            warnMsg.id
        );
    }


    await sendDuelTurnMessage(
        message.channel,
        duelData
    );
});


async function sendDuelTurnMessage(
    channel,
    duelData
) {

    const currentId =
        duelData.players[duelData.turn];

    const p1Stats =
        duelData.stats[
            duelData.players[0]
        ];

    const p2Stats =
        duelData.stats[
            duelData.players[1]
        ];


    const msg =
        await channel.send(

            `<@${currentId}> sıra sende! yumruk, kalkan, şifa, ultra güç, pas ve kaç komutlarını kullanabilirsin.\n\n` +

            `**${p1Stats.name}**\nCan: ${p1Stats.hp} | Enerji: ${p1Stats.energy}\n\n` +

            `**${p2Stats.name}**\nCan: ${p2Stats.hp} | Enerji: ${p2Stats.energy}`

        );


    duelData.messages.push(
        msg.id
    );
}


async function cleanupDuelMessages(
    channel,
    duelData
) {

    if (
        !duelData.messages ||
        duelData.messages.length === 0
    ) return;


    try {

        const chunks = [];

        for (
            let i = 0;
            i < duelData.messages.length;
            i += 100
        ) {

            chunks.push(
                duelData.messages.slice(
                    i,
                    i + 100
                )
            );
        }


        for (const chunk of chunks) {

            await channel
                .bulkDelete(chunk)
                .catch(() => {});

        }

    } catch (err) {

        console.error(
            'Düello mesajları silinirken hata oluştu:',
            err
        );
    }
}


function startDuel(
    channel,
    p1,
    p2,
    guild
) {

    const duelData = {

        players: [
            p1.id,
            p2.id
        ],

        turn:
            Math.random() < 0.5
                ? 0
                : 1,

        messages: [],

        stats: {

            [p1.id]: {
                name: p1.username,
                hp: 500,
                energy: 150,
                punchCount: 0,
                defending: false
            },

            [p2.id]: {
                name: p2.username,
                hp: 500,
                energy: 150,
                punchCount: 0,
                defending: false
            }
        }
    };


    activeDuels.set(
        channel.id,
        duelData
    );


    sendDuelTurnMessage(
        channel,
        duelData
    );
}


// ======================================================
// BOTU BAŞLAT
// ======================================================

client.login(
    process.env.BOT_TOKEN
);
