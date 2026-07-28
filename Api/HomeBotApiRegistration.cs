using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// Registers HomeBot HTTP API routes (reads and Phase 2 REST writes).
/// </summary>
public static class HomeBotApiRegistration
{
    public static void MapHomeBotApi(this WebApplication app, IServiceProvider root)
    {
        MapReads(app, root);
        MapWrites(app, root);
        BudgetApiRegistration.MapBudgetApi(app, root);
        HouseholdConfigApi.MapHouseholdConfigRoutes(app, root);
    }

    private static bool TryActor(IQueryCollection query, out ulong actor, out IResult? error)
    {
        actor = 0;
        error = null;
        if (!ulong.TryParse(query["actorUserId"], out actor) || actor == 0)
        {
            error = ApiResults.BadRequest(
                "Non-zero query parameter 'actorUserId' (Discord user id) is required.",
                "actor_required");
            return false;
        }

        return true;
    }

    private static void MapReads(WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/buy", (HttpRequest request) =>
        {
            var buyService = root.GetRequiredService<BuyService>();
            ulong? assignedTo = null;
            if (ulong.TryParse(request.Query["assignedTo"], out var assignedParsed))
                assignedTo = assignedParsed;

            var store = request.Query["store"].ToString();
            var tag = request.Query["tag"].ToString();
            var sort = request.Query["sort"].ToString();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(buyService.GetBuyList(assignedTo, store, tag, sort, page));
        });

        app.MapGet("/api/buy/items", (HttpRequest request) =>
        {
            var buyService = root.GetRequiredService<BuyService>();
            ulong? assignedTo = null;
            if (ulong.TryParse(request.Query["assignedTo"], out var assignedParsed))
                assignedTo = assignedParsed;

            var store = request.Query["store"].ToString();
            var tag = request.Query["tag"].ToString();
            var sort = request.Query["sort"].ToString();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(buyService.GetBuyList(assignedTo, store, tag, sort, page));
        });

        app.MapGet("/api/buy/tags", () =>
        {
            var buy = root.GetRequiredService<BuyService>();
            var tags = buy.GetBuyTagCatalog();
            return Results.Ok(new { tags, catalogEnforced = tags.Count > 0 });
        });

        app.MapGet("/api/buy/stale", (HttpRequest request) =>
        {
            var buy = root.GetRequiredService<BuyService>();
            var days = 14;
            if (int.TryParse(request.Query["days"], out var daysParsed) && daysParsed > 0)
                days = daysParsed;
            var limit = 10;
            if (int.TryParse(request.Query["limit"], out var limitParsed) && limitParsed > 0)
                limit = limitParsed;
            return Results.Ok(new { days, items = buy.GetStaleItems(days, limit) });
        });

        app.MapGet("/api/wishlist", (HttpRequest request) =>
        {
            var wishlistService = root.GetRequiredService<WishlistService>();
            ulong? owner = null;
            if (ulong.TryParse(request.Query["owner"], out var ownerParsed))
                owner = ownerParsed;

            var tag = request.Query["tag"].ToString();
            var sort = request.Query["sort"].ToString();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(wishlistService.GetWishlist(owner, tag, sort, page));
        });

        app.MapGet("/api/wishlist/items", (HttpRequest request) =>
        {
            var wishlistService = root.GetRequiredService<WishlistService>();
            ulong? owner = null;
            if (ulong.TryParse(request.Query["owner"], out var ownerParsed))
                owner = ownerParsed;

            var tag = request.Query["tag"].ToString();
            var sort = request.Query["sort"].ToString();

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(wishlistService.GetWishlist(owner, tag, sort, page));
        });

        app.MapGet("/api/wishlist/tags", () =>
        {
            var wl = root.GetRequiredService<WishlistService>();
            var tags = wl.GetWishlistTagCatalog();
            return Results.Ok(new { tags, catalogEnforced = tags.Count > 0 });
        });

        app.MapGet("/api/wishlist/owners", () =>
        {
            var wl = root.GetRequiredService<WishlistService>();
            return Results.Ok(new { owners = wl.GetDistinctActiveOwners() });
        });

        app.MapGet("/api/wishlist/{id:int}", (int id) =>
        {
            var wishlistService = root.GetRequiredService<WishlistService>();
            var item = wishlistService.GetItem(id);
            return item is null ? ApiResults.NotFound("Wishlist item not found.") : Results.Ok(item);
        });

        app.MapGet("/api/wishlist/items/{id:int}", (int id) =>
        {
            var wishlistService = root.GetRequiredService<WishlistService>();
            var item = wishlistService.GetItem(id);
            return item is null ? ApiResults.NotFound("Wishlist item not found.") : Results.Ok(item);
        });

        app.MapGet("/api/money/transactions", (HttpRequest request) =>
        {
            var moneyService = root.GetRequiredService<MoneyService>();
            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(moneyService.GetTransactions(page));
        });

        app.MapGet("/api/money/summary", (HttpRequest request) =>
        {
            var moneyService = root.GetRequiredService<MoneyService>();

            if (!ulong.TryParse(request.Query["user1"], out var user1) ||
                !ulong.TryParse(request.Query["user2"], out var user2))
            {
                return ApiResults.BadRequest("Query params user1 and user2 are required.", "missing_query_params");
            }

            var name1 = request.Query["name1"].ToString();
            var name2 = request.Query["name2"].ToString();

            if (string.IsNullOrWhiteSpace(name1))
                name1 = $"user-{user1}";
            if (string.IsNullOrWhiteSpace(name2))
                name2 = $"user-{user2}";

            return Results.Ok(moneyService.GetSummary(user1, user2, name1, name2));
        });

        app.MapGet("/api/calendar", (HttpRequest request) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var typeFilter = request.Query["type"].ToString();
            return Results.Ok(calendarService.GetList(page, string.IsNullOrWhiteSpace(typeFilter) ? null : typeFilter));
        });

        app.MapGet("/api/calendar/items", (HttpRequest request) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            var typeFilter = request.Query["type"].ToString();
            return Results.Ok(calendarService.GetList(page, string.IsNullOrWhiteSpace(typeFilter) ? null : typeFilter));
        });

        app.MapGet("/api/calendar/{id:int}", (HttpRequest request, int id) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            var inst = request.Query["instanceStartUtc"].ToString();
            var item = calendarService.GetItem(id, string.IsNullOrWhiteSpace(inst) ? null : inst);
            return item is null ? ApiResults.NotFound("Calendar item not found.") : Results.Ok(item);
        }).WithCalendarItemGetDocs();

        app.MapGet("/api/calendar/items/{id:int}", (HttpRequest request, int id) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            var inst = request.Query["instanceStartUtc"].ToString();
            var item = calendarService.GetItem(id, string.IsNullOrWhiteSpace(inst) ? null : inst);
            return item is null ? ApiResults.NotFound("Calendar item not found.") : Results.Ok(item);
        }).WithCalendarItemGetDocs();

        app.MapGet("/api/calendar/today", (HttpRequest request) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            ulong? userFilter = null;
            if (ulong.TryParse(request.Query["userFilter"], out var userFilterParsed))
                userFilter = userFilterParsed;

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(calendarService.GetToday(userFilter, page));
        });

        app.MapGet("/api/calendar/upcoming", (HttpRequest request) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            ulong? userFilter = null;
            if (ulong.TryParse(request.Query["userFilter"], out var userFilterParsed))
                userFilter = userFilterParsed;

            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(calendarService.GetUpcoming(userFilter, page));
        });

        app.MapGet("/api/calendar/range", (HttpRequest request) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();

            var fromStr = request.Query["from"].ToString();
            var toStr = request.Query["to"].ToString();

            if (!DateTime.TryParseExact(
                    fromStr,
                    "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out var fromLocal))
            {
                return ApiResults.BadRequest("Query 'from' must be YYYY-MM-DD.", "invalid_from");
            }

            if (!DateTime.TryParseExact(
                    toStr,
                    "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out var toLocal))
            {
                return ApiResults.BadRequest("Query 'to' must be YYYY-MM-DD.", "invalid_to");
            }

            if (toLocal <= fromLocal)
                return ApiResults.BadRequest("Query 'to' must be after 'from'.", "invalid_range");

            if ((toLocal - fromLocal).TotalDays > CalendarService.RangeMaxDays)
                return ApiResults.BadRequest($"Range too wide (max {CalendarService.RangeMaxDays} days).", "range_too_wide");

            ulong? userFilter = null;
            if (ulong.TryParse(request.Query["userFilter"], out var userFilterParsed))
                userFilter = userFilterParsed;

            var windowTz = request.Query["timeZone"].ToString();
            if (string.IsNullOrWhiteSpace(windowTz))
                windowTz = null;

            var includeCompleted = string.Equals(request.Query["includeCompleted"], "true", StringComparison.OrdinalIgnoreCase)
                || string.Equals(request.Query["includeCompleted"], "1", StringComparison.OrdinalIgnoreCase);

            return Results.Ok(calendarService.GetRange(fromLocal, toLocal, userFilter, windowTz, includeCompleted));
        });

        app.MapGet("/api/calendar/export.ics", (HttpRequest request) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();

            var fromStr = request.Query["from"].ToString();
            var toStr = request.Query["to"].ToString();

            if (!DateTime.TryParseExact(
                    fromStr,
                    "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out var fromLocal))
                return ApiResults.BadRequest("Query 'from' must be YYYY-MM-DD.", "invalid_from");

            if (!DateTime.TryParseExact(
                    toStr,
                    "yyyy-MM-dd",
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None,
                    out var toLocal))
                return ApiResults.BadRequest("Query 'to' must be YYYY-MM-DD.", "invalid_to");

            if (toLocal <= fromLocal)
                return ApiResults.BadRequest("Query 'to' must be after 'from'.", "invalid_range");

            if ((toLocal - fromLocal).TotalDays > CalendarService.RangeMaxDays)
                return ApiResults.BadRequest($"Range too wide (max {CalendarService.RangeMaxDays} days).", "range_too_wide");

            ulong? userFilter = null;
            if (ulong.TryParse(request.Query["userFilter"], out var userFilterParsed))
                userFilter = userFilterParsed;

            var windowTz = request.Query["timeZone"].ToString();
            if (string.IsNullOrWhiteSpace(windowTz))
                windowTz = null;

            var items = calendarService.GetRange(fromLocal, toLocal, userFilter, windowTz);
            var ics = CalendarIcsExport.Build(items);
            return Results.Text(ics, "text/calendar; charset=utf-8");
        });

        app.MapGet("/api/discord/guild/members", async () =>
        {
            var directory = root.GetRequiredService<DiscordGuildDirectoryService>();
            return Results.Ok(await directory.GetMembersAsync().ConfigureAwait(false));
        });
    }

    private static void MapWrites(WebApplication app, IServiceProvider root)
    {
        var w = app.MapGroup("/api").RequireRateLimiting("mutation");

        w.MapPost("/buy/items", async (HttpRequest http, BuyItemCreateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var name = body.Name ?? "";
            var errMsg =
                Validation.ValidateName(name) ??
                Validation.ValidateQuantity(body.Quantity ?? "") ??
                Validation.ValidateStore(body.Store ?? "") ??
                Validation.ValidateTags(body.Tags ?? "") ??
                Validation.ValidateNotes(body.Notes ?? "");

            if (errMsg != null)
                return ApiResults.Validation(errMsg);

            var buy = root.GetRequiredService<BuyService>();
            buy.AddItem(
                name,
                body.Quantity ?? "",
                body.Store ?? "",
                body.AssignedTo,
                body.Tags ?? "",
                body.Notes ?? "",
                actor);

            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "buy",
                $"🛒 **Buy list** (via web): added **{DiscordNotifyText.SanitizeInline(name)}**");

            return Results.Created($"/api/buy/items", new { ok = true });
        });

        w.MapPut("/buy/items/{id:int}", (int id, BuyItemUpdateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            var errMsg =
                (string.IsNullOrWhiteSpace(body.Name) ? null : Validation.ValidateName(body.Name)) ??
                (string.IsNullOrWhiteSpace(body.Quantity) ? null : Validation.ValidateQuantity(body.Quantity)) ??
                (string.IsNullOrWhiteSpace(body.Store) ? null : Validation.ValidateStore(body.Store)) ??
                (string.IsNullOrWhiteSpace(body.Tags) ? null : Validation.ValidateTags(body.Tags)) ??
                (string.IsNullOrWhiteSpace(body.Notes) ? null : Validation.ValidateNotes(body.Notes));

            if (errMsg != null)
                return ApiResults.Validation(errMsg);

            var buy = root.GetRequiredService<BuyService>();
            if (!buy.EditItem(
                    id,
                    body.Name ?? "",
                    body.Quantity ?? "",
                    body.Store ?? "",
                    body.AssignedTo,
                    body.Tags ?? "",
                    body.Notes ?? ""))
            {
                return ApiResults.BadRequest("Nothing to update.", "no_changes");
            }

            return Results.Ok(new { ok = true });
        });

        w.MapDelete("/buy/items/completed", () =>
        {
            root.GetRequiredService<BuyService>().ClearCompleted();
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/buy/items/bulk-complete", (BulkItemIdsRequest? body) =>
        {
            if (body?.Ids is null || body.Ids.Count == 0)
                return ApiResults.BadRequest("ids array is required.", "missing_ids");
            if (body.Ids.Count > 50)
                return ApiResults.BadRequest("At most 50 ids per request.", "too_many_ids");
            var count = root.GetRequiredService<BuyService>().BulkCompleteItems(body.Ids, body.ActorUserId);
            return Results.Ok(new { ok = true, count });
        });

        w.MapPost("/buy/items/bulk-delete", (BulkItemIdsRequest? body) =>
        {
            if (body?.Ids is null || body.Ids.Count == 0)
                return ApiResults.BadRequest("ids array is required.", "missing_ids");
            if (body.Ids.Count > 50)
                return ApiResults.BadRequest("At most 50 ids per request.", "too_many_ids");
            var count = root.GetRequiredService<BuyService>().BulkDeleteItems(body.Ids, body.ActorUserId);
            return Results.Ok(new { ok = true, count });
        });

        w.MapPost("/buy/items/{id:int}/complete", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<BuyService>().CompleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapDelete("/buy/items/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<BuyService>().DeleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPut("/buy/tags", (BuyTagCatalogPutRequest? body) =>
        {
            if (body?.Tags is null)
                return ApiResults.BadRequest("Request body with 'tags' array is required.", "missing_body");

            var buy = root.GetRequiredService<BuyService>();
            buy.SetBuyTagCatalog(body.Tags);
            return Results.Ok(new { ok = true, tags = buy.GetBuyTagCatalog() });
        });

        w.MapPut("/wishlist/tags", (WishlistTagCatalogPutRequest? body) =>
        {
            if (body?.Tags is null)
                return ApiResults.BadRequest("Request body with 'tags' array is required.", "missing_body");

            var wl = root.GetRequiredService<WishlistService>();
            wl.SetWishlistTagCatalog(body.Tags);
            return Results.Ok(new { ok = true, tags = wl.GetWishlistTagCatalog() });
        });

        w.MapPost("/wishlist/items", async (HttpRequest http, WishlistItemCreateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var name = body.Name ?? "";
            var nameErr = Validation.ValidateName(name);
            if (nameErr != null)
                return ApiResults.Validation(nameErr);

            var tagErr = Validation.ValidateTags(body.Tags ?? "");
            if (tagErr != null)
                return ApiResults.Validation(tagErr);

            var noteErr = Validation.ValidateNotes(body.Notes ?? "");
            if (noteErr != null)
                return ApiResults.Validation(noteErr);

            var owner = body.OwnerUserId ?? actor;
            var normalizedPriority = "";
            if (!string.IsNullOrWhiteSpace(body.Priority) && int.TryParse(body.Priority, out var p))
            {
                p = Math.Clamp(p, 1, 3);
                normalizedPriority = p.ToString();
            }

            root.GetRequiredService<WishlistService>().AddItem(
                name,
                owner,
                body.Price ?? "",
                body.Link ?? "",
                body.Description ?? "",
                body.Notes ?? "",
                normalizedPriority,
                body.Tags ?? "");

            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "wishlist",
                $"💝 **Wishlist** (via web): added **{DiscordNotifyText.SanitizeInline(name)}**");

            return Results.Created("/api/wishlist/items", new { ok = true });
        });

        w.MapPut("/wishlist/items/{id:int}", (int id, WishlistItemUpdateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            if (!string.IsNullOrWhiteSpace(body.Name))
            {
                var e = Validation.ValidateName(body.Name);
                if (e != null)
                    return ApiResults.Validation(e);
            }

            var tagErr = string.IsNullOrWhiteSpace(body.Tags) ? null : Validation.ValidateTags(body.Tags);
            if (tagErr != null)
                return ApiResults.Validation(tagErr);

            var noteErr = string.IsNullOrWhiteSpace(body.Notes) ? null : Validation.ValidateNotes(body.Notes);
            if (noteErr != null)
                return ApiResults.Validation(noteErr);

            root.GetRequiredService<WishlistService>().EditItem(
                id,
                body.Name ?? "",
                body.OwnerUserId,
                body.Price ?? "",
                body.Link ?? "",
                body.Description ?? "",
                body.Notes ?? "",
                body.Priority ?? "",
                body.Tags ?? "");

            return Results.Ok(new { ok = true });
        });

        w.MapDelete("/wishlist/items/completed", () =>
        {
            root.GetRequiredService<WishlistService>().ClearCompleted();
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/wishlist/items/bulk-complete", (BulkItemIdsRequest? body) =>
        {
            if (body?.Ids is null || body.Ids.Count == 0)
                return ApiResults.BadRequest("ids array is required.", "missing_ids");
            if (body.Ids.Count > 50)
                return ApiResults.BadRequest("At most 50 ids per request.", "too_many_ids");
            var count = root.GetRequiredService<WishlistService>().BulkCompleteItems(body.Ids, body.ActorUserId);
            return Results.Ok(new { ok = true, count });
        });

        w.MapPost("/wishlist/items/bulk-delete", (BulkItemIdsRequest? body) =>
        {
            if (body?.Ids is null || body.Ids.Count == 0)
                return ApiResults.BadRequest("ids array is required.", "missing_ids");
            if (body.Ids.Count > 50)
                return ApiResults.BadRequest("At most 50 ids per request.", "too_many_ids");
            var count = root.GetRequiredService<WishlistService>().BulkDeleteItems(body.Ids, body.ActorUserId);
            return Results.Ok(new { ok = true, count });
        });

        w.MapPost("/wishlist/items/{id:int}/complete", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<WishlistService>().MarkComplete(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/wishlist/items/{id:int}/add-to-buy", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            if (!root.GetRequiredService<WishlistService>().AddItemToBuyList(id, actor))
                return ApiResults.NotFound("Wishlist item not found.");

            return Results.Ok(new { ok = true });
        });

        w.MapDelete("/wishlist/items/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<WishlistService>().DeleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/money/expenses", async (MoneyExpenseCreateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            var name = body.Name ?? "";
            var nameErr = Validation.ValidateName(name);
            if (nameErr != null)
                return ApiResults.Validation(nameErr);

            if (body.PaidBy == 0 || body.OwedBy == 0)
                return ApiResults.BadRequest("paidBy and owedBy must be non-zero.", "invalid_participants");

            if (string.IsNullOrWhiteSpace(body.AmountInput))
                return ApiResults.BadRequest("amountInput is required.", "missing_amount");

            root.GetRequiredService<MoneyService>().AddExpense(name, body.AmountInput, body.PaidBy, body.OwedBy);

            var sName = DiscordNotifyText.SanitizeInline(name);
            var sAmt = DiscordNotifyText.SanitizeInline(body.AmountInput, 40);
            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "money",
                $"💰 **Money** (via web): logged expense **{sName}** — `{sAmt}`");

            return Results.Created("/api/money/transactions", new { ok = true });
        });

        w.MapPost("/money/expenses/split", async (MoneyExpenseSplitCreateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            var name = body.Name ?? "";
            var nameErr = Validation.ValidateName(name);
            if (nameErr != null)
                return ApiResults.Validation(nameErr);

            if (body.PaidBy == 0 || body.OwedBy == 0)
                return ApiResults.BadRequest("paidBy and owedBy must be non-zero.", "invalid_participants");

            if (string.IsNullOrWhiteSpace(body.AmountInput))
                return ApiResults.BadRequest("amountInput is required.", "missing_amount");

            var percent = Math.Clamp(body.Percent, 1, 100);
            root.GetRequiredService<MoneyService>().AddPercentageExpense(
                name,
                body.Description ?? "",
                body.Notes ?? "",
                body.AmountInput,
                body.PaidBy,
                body.OwedBy,
                percent);

            var sName = DiscordNotifyText.SanitizeInline(name);
            var sAmt = DiscordNotifyText.SanitizeInline(body.AmountInput, 40);
            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "money",
                $"💰 **Money** (via web): logged split expense **{sName}** ({percent}%, `{sAmt}`)");

            return Results.Created("/api/money/transactions", new { ok = true });
        });

        w.MapPost("/money/payments", async (MoneyPaymentCreateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            if (body.PaidBy == 0 || body.ReceivedBy == 0)
                return ApiResults.BadRequest("paidBy and receivedBy must be non-zero.", "invalid_participants");

            if (string.IsNullOrWhiteSpace(body.AmountInput))
                return ApiResults.BadRequest("amountInput is required.", "missing_amount");

            root.GetRequiredService<MoneyService>().AddPayment(body.AmountInput, body.PaidBy, body.ReceivedBy);

            var sAmt = DiscordNotifyText.SanitizeInline(body.AmountInput, 40);
            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "money",
                $"💰 **Money** (via web): recorded a payment — `{sAmt}`");

            return Results.Created("/api/money/transactions", new { ok = true });
        });

        w.MapPatch("/money/transactions/{id:int}", (int id, MoneyTransactionPatchRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<MoneyService>().EditTransaction(
                id,
                body.Name ?? "",
                body.Description ?? "",
                body.Notes ?? "",
                body.AmountInput ?? "");

            return Results.Ok(new { ok = true });
        });

        w.MapDelete("/money/transactions/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<MoneyService>().DeleteTransaction(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/calendar/import.ics", async (HttpRequest http) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            string icsText;
            if (http.HasFormContentType)
            {
                var form = await http.ReadFormAsync();
                var file = form.Files.FirstOrDefault();
                if (file == null)
                    return ApiResults.BadRequest("ics file required (multipart field 'file').", "missing_file");
                using var reader = new StreamReader(file.OpenReadStream());
                icsText = await reader.ReadToEndAsync();
            }
            else
            {
                using var reader = new StreamReader(http.Body);
                icsText = await reader.ReadToEndAsync();
                if (string.IsNullOrWhiteSpace(icsText))
                    return ApiResults.BadRequest("Request body or multipart file is required.", "missing_body");
            }

            var parsed = CalendarIcsImport.Parse(icsText);
            var calendar = root.GetRequiredService<CalendarService>();
            var config = root.GetRequiredService<ConfigService>();
            var imported = CalendarIcsImport.ImportIntoCalendar(calendar, config, parsed, actor);

            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "calendar",
                $"📅 **Calendar** (via web): imported **{imported}** event(s) from .ics");

            return Results.Ok(new { imported, parsed = parsed.Count });
        });

        w.MapPost("/calendar/items", async (CalendarItemCreateRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            var title = body.Title ?? "";
            var titleErr = Validation.ValidateName(title);
            if (titleErr != null)
                return ApiResults.Validation(titleErr);

            var start = body.Start ?? "";
            if (!ValidationHelper.ValidateDate(start, out var dateError))
                return ApiResults.Validation(dateError);

            if (!ValidationHelper.ValidateReminder(body.Reminder ?? "", out var reminderError))
                return ApiResults.Validation(reminderError);

            if (!ValidationHelper.ValidateRecurrence(body.Recurrence ?? "", out var recurError))
                return ApiResults.Validation(recurError);

            var config = root.GetRequiredService<ConfigService>();
            var householdTzRaw = config.Get("timezone");
            var householdTz = TimeZoneResolver.Resolve(
                string.IsNullOrWhiteSpace(householdTzRaw) ? null : householdTzRaw.Trim(),
                TimeZoneResolver.DefaultHouseholdTimeZoneId);
            var eventTz = TimeZoneResolver.Resolve(
                string.IsNullOrWhiteSpace(body.Timezone) ? null : body.Timezone!.Trim(),
                householdTz.Id);

            string type = string.IsNullOrWhiteSpace(start) ? "task" : "event";
            string finalStart = start;
            if (!string.IsNullOrWhiteSpace(start) &&
                TimeZoneResolver.TryParseWallDateTimeToUtcStorage(start.Trim(), eventTz, out var isoUtc, out _))
            {
                finalStart = isoUtc;
            }
            else
            {
                var parsedStart = DateParser.Parse(start);
                if (parsedStart.HasValue)
                {
                    var wall = DateTime.SpecifyKind(parsedStart.Value, DateTimeKind.Unspecified);
                    var utc = TimeZoneInfo.ConvertTimeToUtc(wall, eventTz);
                    finalStart = utc.ToString("yyyy-MM-dd HH:mm");
                }
            }

            ulong? assignedId = null;
            if (body.AssignToEveryone)
                assignedId = 0;
            else if (body.AssignedToUserId.HasValue)
                assignedId = body.AssignedToUserId.Value;

            var reminderSpan = ReminderParser.Parse(body.Reminder ?? "");
            var reminderValue = reminderSpan.HasValue
                ? reminderSpan.Value.TotalSeconds.ToString()
                : "";

            var endRaw = body.End ?? "";
            var finalEnd = endRaw;
            if (!string.IsNullOrWhiteSpace(endRaw))
            {
                if (TimeZoneResolver.TryParseWallDateTimeToUtcStorage(endRaw.Trim(), eventTz, out var endUtc, out _))
                    finalEnd = endUtc;
                else
                {
                    var parsedEnd = DateParser.Parse(endRaw);
                    if (parsedEnd.HasValue)
                    {
                        var wallEnd = DateTime.SpecifyKind(parsedEnd.Value, DateTimeKind.Unspecified);
                        finalEnd = TimeZoneInfo.ConvertTimeToUtc(wallEnd, eventTz).ToString("yyyy-MM-dd HH:mm");
                    }
                }
            }

            try
            {
                root.GetRequiredService<CalendarService>().AddItem(
                    title,
                    type,
                    finalStart,
                    finalEnd,
                    body.AllDay,
                    reminderValue,
                    assignedId,
                    body.Description ?? "",
                    body.Notes ?? "",
                    body.Link ?? "",
                    body.Recurrence ?? "",
                    eventTz.Id);
            }
            catch
            {
                return ApiResults.BadRequest("Could not add calendar item.", "calendar_invalid");
            }

            var sTitle = DiscordNotifyText.SanitizeInline(title);
            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "calendar",
                $"📅 **Calendar** (via web): added **{sTitle}** ({type})");

            return Results.Created("/api/calendar/items", new { ok = true });
        });

        w.MapPatch("/calendar/items/{id:int}", (int id, CalendarItemPatchRequest? body) =>
        {
            if (body is null)
                return ApiResults.BadRequest("Request body is required.", "missing_body");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            if (!string.IsNullOrWhiteSpace(body.Title))
            {
                var e = Validation.ValidateName(body.Title);
                if (e != null)
                    return ApiResults.Validation(e);
            }

            if (body.Recurrence != null && !ValidationHelper.ValidateRecurrence(body.Recurrence, out var recurPatchError))
                return ApiResults.Validation(recurPatchError);

            root.GetRequiredService<CalendarService>().EditItem(
                id,
                body.Title ?? "",
                body.Start ?? "",
                body.End ?? "",
                body.Description ?? "",
                body.Notes ?? "",
                body.Link ?? "",
                body.Timezone,
                body.AllDay,
                body.Reminder,
                applyReminder: body.Reminder != null,
                body.Recurrence,
                applyRecurrence: body.Recurrence != null,
                body.ClearAssignedTo == true ? null : body.AssignedTo,
                applyAssignedTo: body.AssignedTo != null || body.ClearAssignedTo == true,
                clearEnd: body.ClearEnd == true);

            return Results.Ok(new { ok = true });
        });

        w.MapPost("/calendar/items/{id:int}/complete", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<CalendarService>().CompleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/calendar/items/{id:int}/omit-instance", (HttpRequest http, int id, CalendarInstanceOmitRequest? body) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.InstanceStartUtc))
                return ApiResults.BadRequest("instanceStartUtc is required.", "missing_body");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            try
            {
                root.GetRequiredService<CalendarService>().OmitRecurrenceInstance(id, body.InstanceStartUtc, actor);
            }
            catch (ArgumentException ex)
            {
                return ApiResults.BadRequest(ex.Message, "calendar_omit_invalid");
            }
            catch (InvalidOperationException ex)
            {
                return ApiResults.BadRequest(ex.Message, "calendar_omit_invalid");
            }

            return Results.Ok(new { ok = true });
        });

        w.MapPost("/calendar/items/{id:int}/complete-instance", (HttpRequest http, int id, CalendarInstanceOmitRequest? body) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.InstanceStartUtc))
                return ApiResults.BadRequest("instanceStartUtc is required.", "missing_body");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            try
            {
                root.GetRequiredService<CalendarService>().CompleteRecurrenceInstance(id, body.InstanceStartUtc, actor);
            }
            catch (ArgumentException ex)
            {
                return ApiResults.BadRequest(ex.Message, "calendar_instance_invalid");
            }
            catch (InvalidOperationException ex)
            {
                return ApiResults.BadRequest(ex.Message, "calendar_instance_invalid");
            }

            return Results.Ok(new { ok = true });
        });

        w.MapPatch("/calendar/items/{id:int}/instance", (HttpRequest http, int id, CalendarInstancePatchRequest? body) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.InstanceStartUtc))
                return ApiResults.BadRequest("instanceStartUtc is required.", "missing_body");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            try
            {
                root.GetRequiredService<CalendarService>().PatchRecurrenceInstance(id, body, actor);
            }
            catch (ArgumentException ex)
            {
                return ApiResults.BadRequest(ex.Message, "calendar_instance_invalid");
            }
            catch (InvalidOperationException ex)
            {
                return ApiResults.BadRequest(ex.Message, "calendar_instance_invalid");
            }

            return Results.Ok(new { ok = true });
        });

        w.MapDelete("/calendar/items/{id:int}/instance", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;
            var iso = http.Query["instanceStartUtc"].ToString();
            if (string.IsNullOrWhiteSpace(iso))
                return ApiResults.BadRequest("Query parameter 'instanceStartUtc' is required.", "missing_instance");

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            try
            {
                var cleared = root.GetRequiredService<CalendarService>().ClearRecurrenceInstance(id, iso, actor);
                if (!cleared)
                    return ApiResults.NotFound("No per-instance row for that occurrence.");
            }
            catch (InvalidOperationException ex)
            {
                return ApiResults.BadRequest(ex.Message, "calendar_instance_invalid");
            }

            return Results.Ok(new { ok = true });
        }).WithCalendarItemDeleteInstanceDocs();

        w.MapDelete("/calendar/items/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return ApiResults.Validation(idErr);

            root.GetRequiredService<CalendarService>().DeleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/undo", (HttpRequest http) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var result = root.GetRequiredService<UndoService>().ApplyLastUndo(actor);

            if (result.IsNothingToUndo)
                return Results.Ok(new { undone = false, message = result.Message });

            if (!result.IsSuccess)
                return ApiResults.BadRequest(result.Message ?? "Undo failed.", "undo_failed");

            return Results.Ok(new { undone = true });
        });
    }
}
