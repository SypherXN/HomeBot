using Discord;
using Discord.WebSocket;
using Discord.Interactions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;

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
        _services = ConfigureServices();
        var apiTask = StartApiAsync();

        if (!IsDiscordEnabled())
        {
            Console.WriteLine("ℹ️ Discord host disabled (set HOMEBOT_DISCORD_ENABLED=true to enable).");
            await apiTask;
            return;
        }

        _client = new DiscordSocketClient(new DiscordSocketConfig
        {
            GatewayIntents = GatewayIntents.All
        });

        _interactions = new InteractionService(_client.Rest);

        _client.Ready += OnReady;
        _client.InteractionCreated += HandleInteraction;

        await _client.LoginAsync(TokenType.Bot, GetToken());
        await _client.StartAsync();

        _client.Log += msg =>
        {
            Console.WriteLine(msg.ToString());
            return Task.CompletedTask;
        };

        _ = apiTask;

        await Task.Delay(-1);
    }

    /// <summary>
    /// Registers all DI services used by commands and interaction handlers.
    /// </summary>
    private IServiceProvider ConfigureServices()
    {
        return new ServiceCollection()
            .AddSingleton(_ => _client)
            .AddSingleton(_ => _interactions)
            .AddSingleton<DatabaseService>()
            .AddSingleton<ConfigService>()
            .AddSingleton<BuyService>()
            .AddSingleton<ChannelBindingService>()
            .AddSingleton<UndoService>()
            .AddSingleton<LoggingService>()
            .AddSingleton<WishlistService>()
            .AddSingleton<MoneyService>()
            .AddSingleton<CalendarService>()
            .AddSingleton<ReminderService>()
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

    /// <summary>
    /// Starts the web API host in the same process as the bot.
    /// </summary>
    private async Task StartApiAsync()
    {
        if (!IsApiEnabled())
        {
            Console.WriteLine("ℹ️ API host disabled (set HOMEBOT_API_ENABLED=true to enable).");
            return;
        }

        var builder = WebApplication.CreateBuilder();
        var allowedOrigins = GetAllowedOrigins();
        var apiToken = Environment.GetEnvironmentVariable("HOMEBOT_API_TOKEN") ?? "";

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("WebUiOrigins", policy =>
            {
                policy.WithOrigins(allowedOrigins)
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            });
        });

        var app = builder.Build();
        app.UseCors("WebUiOrigins");

        app.Use(async (context, next) =>
        {
            if (!context.Request.Path.StartsWithSegments("/api"))
            {
                await next();
                return;
            }

            if (context.Request.Path.StartsWithSegments("/api/health") ||
                context.Request.Path.StartsWithSegments("/api/meta"))
            {
                await next();
                return;
            }

            if (string.IsNullOrWhiteSpace(apiToken))
            {
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                await context.Response.WriteAsJsonAsync(new
                {
                    error = "API token not configured."
                });
                return;
            }

            var authHeader = context.Request.Headers.Authorization.ToString();
            const string prefix = "Bearer ";

            if (!authHeader.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new { error = "Missing bearer token." });
                return;
            }

            var token = authHeader[prefix.Length..].Trim();
            if (!string.Equals(token, apiToken, StringComparison.Ordinal))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new { error = "Invalid token." });
                return;
            }

            await next();
        });

        app.MapGet("/api/health", () => Results.Ok(new
        {
            status = "ok",
            service = "homebot-api",
            timestamp = DateTimeOffset.UtcNow
        }));

        app.MapGet("/api/meta", () => Results.Ok(new
        {
            name = "HomeBot API",
            version = "phase2-bootstrap",
            features = new[] { "buy", "wishlist", "money", "calendar", "undo" }
        }));

        app.MapGet("/api/buy", (HttpRequest request) =>
        {
            var buyService = _services.GetRequiredService<BuyService>();

            ulong? assignedTo = null;
            if (ulong.TryParse(request.Query["assignedTo"], out var assignedParsed))
                assignedTo = assignedParsed;

            var store = request.Query["store"].ToString();
            var tag = request.Query["tag"].ToString();
            var sort = request.Query["sort"].ToString();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var result = buyService.GetBuyList(assignedTo, store, tag, sort, page);
            return Results.Ok(result);
        });

        app.MapGet("/api/wishlist", (HttpRequest request) =>
        {
            var wishlistService = _services.GetRequiredService<WishlistService>();

            ulong? owner = null;
            if (ulong.TryParse(request.Query["owner"], out var ownerParsed))
                owner = ownerParsed;

            var tag = request.Query["tag"].ToString();
            var sort = request.Query["sort"].ToString();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var result = wishlistService.GetWishlist(owner, tag, sort, page);
            return Results.Ok(result);
        });

        app.MapGet("/api/wishlist/{id:int}", (int id) =>
        {
            var wishlistService = _services.GetRequiredService<WishlistService>();
            var item = wishlistService.GetItem(id);
            return item is null ? Results.NotFound(new { error = "Wishlist item not found." }) : Results.Ok(item);
        });

        app.MapGet("/api/money/transactions", (HttpRequest request) =>
        {
            var moneyService = _services.GetRequiredService<MoneyService>();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var result = moneyService.GetTransactions(page);
            return Results.Ok(result);
        });

        app.MapGet("/api/money/summary", (HttpRequest request) =>
        {
            var moneyService = _services.GetRequiredService<MoneyService>();

            if (!ulong.TryParse(request.Query["user1"], out var user1) ||
                !ulong.TryParse(request.Query["user2"], out var user2))
            {
                return Results.BadRequest(new { error = "Query params user1 and user2 are required." });
            }

            var name1 = request.Query["name1"].ToString();
            var name2 = request.Query["name2"].ToString();

            if (string.IsNullOrWhiteSpace(name1))
                name1 = $"user-{user1}";
            if (string.IsNullOrWhiteSpace(name2))
                name2 = $"user-{user2}";

            var result = moneyService.GetSummary(user1, user2, name1, name2);
            return Results.Ok(result);
        });

        app.MapGet("/api/calendar", (HttpRequest request) =>
        {
            var calendarService = _services.GetRequiredService<CalendarService>();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var result = calendarService.GetList(page);
            return Results.Ok(result);
        });

        app.MapGet("/api/calendar/{id:int}", (int id) =>
        {
            var calendarService = _services.GetRequiredService<CalendarService>();
            var item = calendarService.GetItem(id);
            return item is null ? Results.NotFound(new { error = "Calendar item not found." }) : Results.Ok(item);
        });

        app.MapGet("/api/calendar/today", (HttpRequest request) =>
        {
            var calendarService = _services.GetRequiredService<CalendarService>();

            ulong? userFilter = null;
            if (ulong.TryParse(request.Query["userFilter"], out var userFilterParsed))
                userFilter = userFilterParsed;

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var result = calendarService.GetToday(userFilter, page);
            return Results.Ok(result);
        });

        app.MapGet("/api/calendar/upcoming", (HttpRequest request) =>
        {
            var calendarService = _services.GetRequiredService<CalendarService>();

            ulong? userFilter = null;
            if (ulong.TryParse(request.Query["userFilter"], out var userFilterParsed))
                userFilter = userFilterParsed;

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var result = calendarService.GetUpcoming(userFilter, page);
            return Results.Ok(result);
        });

        var apiUrl = Environment.GetEnvironmentVariable("HOMEBOT_API_URL") ?? "http://0.0.0.0:5050";
        Console.WriteLine($"🌐 API listening on {apiUrl}");
        await app.RunAsync(apiUrl);
    }

    private bool IsApiEnabled()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_API_ENABLED");
        return string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase);
    }

    private bool IsDiscordEnabled()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_DISCORD_ENABLED");
        return !string.Equals(raw, "false", StringComparison.OrdinalIgnoreCase);
    }

    private string[] GetAllowedOrigins()
    {
        var raw = Environment.GetEnvironmentVariable("HOMEBOT_ALLOWED_ORIGINS");

        if (string.IsNullOrWhiteSpace(raw))
        {
            return new[]
            {
                "http://localhost:5173"
            };
        }

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }
}