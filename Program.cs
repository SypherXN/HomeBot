using Discord;
using Discord.WebSocket;
using Discord.Interactions;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Application entry point for the Discord bot.
/// Wires services, registers handlers, and routes interactions.
/// </summary>
class Program
{
    private DiscordSocketClient _client = null!;
    private InteractionService _interactions = null!;
    private IServiceProvider _services = null!;

    /// <summary>
    /// Starts the bot process.
    /// </summary>
    static async Task Main() => await new Program().RunAsync();

    /// <summary>
    /// Configures the Discord client and keeps the process alive.
    /// </summary>
    public async Task RunAsync()
    {
        _client = new DiscordSocketClient(new DiscordSocketConfig
        {
            GatewayIntents = GatewayIntents.All
        });

        _interactions = new InteractionService(_client.Rest);

        _services = ConfigureServices();

        _client.Ready += OnReady;
        _client.InteractionCreated += HandleInteraction;

        await _client.LoginAsync(TokenType.Bot, GetToken());
        await _client.StartAsync();

        _client.Log += msg =>
        {
            Console.WriteLine(msg.ToString());
            return Task.CompletedTask;
        };

        await Task.Delay(-1);
    }

    /// <summary>
    /// Registers all DI services used by commands and interaction handlers.
    /// </summary>
    private IServiceProvider ConfigureServices()
    {
        return new ServiceCollection()
            .AddSingleton(_client)
            .AddSingleton(_interactions)
            .AddSingleton<DatabaseService>()
            .AddSingleton<ConfigService>()
            .AddSingleton<ReminderService>()
            .AddSingleton<BuyService>()
            .AddSingleton<ChannelBindingService>()
            .AddSingleton<UndoService>()
            .AddSingleton<LoggingService>()
            .AddSingleton<WishlistService>()
            .AddSingleton<MoneyService>()
            .AddSingleton<CalendarService>()
            .BuildServiceProvider();
    }

    /// <summary>
    /// Runs after the bot connects and registers interaction modules.
    /// </summary>
    private async Task OnReady()
    {
        Console.WriteLine($"✅ HomeBot connected as {_client.CurrentUser}");

        await _interactions.AddModulesAsync(typeof(Program).Assembly, _services);

        using var scope = _services.CreateScope();
        var reminderService = scope.ServiceProvider.GetRequiredService<ReminderService>();
        _ = reminderService.StartAsync(); // fire and forget

        // Guild-only registration keeps slash command updates instant while developing.
        var guildId = GetGuildId();
        await _interactions.RegisterCommandsToGuildAsync(guildId);
    }

    /// <summary>
    /// Routes incoming interactions to either button handlers or slash command modules.
    /// </summary>
    private async Task HandleInteraction(SocketInteraction interaction)
    {
        using var scope = _services.CreateScope();

        var logger = scope.ServiceProvider.GetRequiredService<LoggingService>();
        var binding = scope.ServiceProvider.GetRequiredService<ChannelBindingService>();

        try
        {
            // Button components must be handled first to avoid interaction timeout.
            if (interaction is SocketMessageComponent component)
            {
                await HandleButton(component);
                return;
            }

            // --- ONLY AFTER BUTTONS ---
            var ctx = new SocketInteractionContext(_client, interaction);

            if (interaction is SocketSlashCommand slashCommand)
            {
                var commandName = slashCommand.Data.Name;
                var feature = CommandFeatureMap.GetFeature(commandName);

                if (feature != null)
                {
                    var expectedChannel = binding.GetChannel(feature);

                    if (expectedChannel.HasValue &&
                        ctx.Channel.Id != expectedChannel.Value)
                    {
                        await slashCommand.RespondAsync(
                            $"❌ This command can only be used in <#{expectedChannel.Value}>",
                            ephemeral: true
                        );
                        return;
                    }
                }
            }

            var result = await _interactions.ExecuteCommandAsync(ctx, _services);

            if (!result.IsSuccess)
            {
                logger.Error($"Command failed: {result.ErrorReason}");

                if (!interaction.HasResponded)
                {
                    await interaction.RespondAsync("❌ Command failed.", ephemeral: true);
                }
            }
        }
        catch (Exception ex)
        {
            logger.Exception(ex);

            if (!interaction.HasResponded)
            {
                await interaction.RespondAsync("❌ Unexpected error occurred.", ephemeral: true);
            }
        }
    }

    /// <summary>
    /// Handles button actions for buy, wishlist, money, and calendar UIs.
    /// </summary>
    private async Task HandleButton(SocketMessageComponent component)
    {
        await component.DeferAsync(); // ✅ fixes timeout

        using var scope = _services.CreateScope();

        var logger = scope.ServiceProvider.GetRequiredService<LoggingService>();
        var buyService = scope.ServiceProvider.GetRequiredService<BuyService>();
        var wishlistService = scope.ServiceProvider.GetRequiredService<WishlistService>();
        var moneyService = scope.ServiceProvider.GetRequiredService<MoneyService>();
        var calendarService = scope.ServiceProvider.GetRequiredService<CalendarService>();

        try
        {
            var customId = component.Data.CustomId;

            logger.Info($"Button clicked: {customId}");

            // ---------------- BUY ----------------

            if (customId.StartsWith("buy_complete_"))
            {
                var id = int.Parse(customId.Replace("buy_complete_", ""));
                buyService.CompleteItem(id, component.User.Id);

                var result = await buyService.BuildBuyList();

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            if (customId.StartsWith("buy_delete_"))
            {
                var id = int.Parse(customId.Replace("buy_delete_", ""));
                buyService.DeleteItem(id, component.User.Id);

                var result = await buyService.BuildBuyList();

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            if (customId.StartsWith("buy_page_"))
            {
                var page = int.Parse(customId.Replace("buy_page_", ""));

                var result = await buyService.BuildBuyList(page: page);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            // ---------------- WISHLIST ----------------

            // --- WISHLIST COMPLETE ---
            if (customId.StartsWith("wishlist_complete_"))
            {
                var id = int.Parse(customId.Replace("wishlist_complete_", ""));
                wishlistService.MarkComplete(id, component.User.Id);

                var result = await wishlistService.BuildWishlist(page: 0);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            // --- WISHLIST DELETE ---
            if (customId.StartsWith("wishlist_delete_"))
            {
                var id = int.Parse(customId.Replace("wishlist_delete_", ""));
                wishlistService.DeleteItem(id, component.User.Id);

                var result = await wishlistService.BuildWishlist(page: 0);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            // --- WISHLIST PAGINATION ---
            if (customId.StartsWith("wishlist_page_"))
            {
                var page = int.Parse(customId.Replace("wishlist_page_", ""));

                var result = await wishlistService.BuildWishlist(page: page);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            // --- MONEY DELETE ---
            if (customId.StartsWith("money_delete_"))
            {
                var id = int.Parse(customId.Replace("money_delete_", ""));

                moneyService.DeleteTransaction(id, component.User.Id);

                var result = await moneyService.BuildTransactions();

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            // --- MONEY PAGINATION ---
            if (customId.StartsWith("money_page_"))
            {
                var page = int.Parse(customId.Replace("money_page_", ""));

                var result = await moneyService.BuildTransactions(page: page);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            if (customId.StartsWith("calendar_complete_"))
            {
                var id = int.Parse(customId.Replace("calendar_complete_", ""));
                calendarService.CompleteItem(id, component.User.Id);

                var result = await calendarService.BuildList();

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            if (customId.StartsWith("calendar_delete_"))
            {
                var id = int.Parse(customId.Replace("calendar_delete_", ""));
                calendarService.DeleteItem(id, component.User.Id);

                var result = await calendarService.BuildList();

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            if (customId.StartsWith("calendar_page_"))
            {
                var page = int.Parse(customId.Replace("calendar_page_", ""));

                var result = await calendarService.BuildList(page);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            if (customId.StartsWith("calendar_today_page_"))
            {
                var page = int.Parse(customId.Replace("calendar_today_page_", ""));

                var result = await calendarService.BuildToday(null, page);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }

            if (customId.StartsWith("calendar_upcoming_page_"))
            {
                var page = int.Parse(customId.Replace("calendar_upcoming_page_", ""));

                var result = await calendarService.BuildUpcoming(null, page);

                await component.ModifyOriginalResponseAsync(msg =>
                {
                    msg.Embed = result.embed;
                    msg.Components = result.components;
                });

                return;
            }
        }
        catch (Exception ex)
        {
            logger.Exception(ex);

            await component.FollowupAsync(
                "❌ Error processing action.",
                ephemeral: true
            );
        }
    }

    /// <summary>
    /// Reads the Discord bot token from environment variables.
    /// </summary>
    private string GetToken()
    {
        var token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");

        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("DISCORD_TOKEN environment variable is missing or invalid.");

        return token;
    }

    /// <summary>
    /// Reads the target guild id from environment variables.
    /// </summary>
    private ulong GetGuildId()
    {
        var raw = Environment.GetEnvironmentVariable("DISCORD_GUILD_ID");

        if (string.IsNullOrWhiteSpace(raw) || !ulong.TryParse(raw, out var guildId))
            throw new InvalidOperationException("DISCORD_GUILD_ID environment variable is missing or invalid.");

        return guildId;
    }
}