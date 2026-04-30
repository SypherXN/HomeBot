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
    }

    private static bool TryActor(IQueryCollection query, out ulong actor, out IResult? error)
    {
        actor = 0;
        error = null;
        if (!ulong.TryParse(query["actorUserId"], out actor) || actor == 0)
        {
            error = Results.BadRequest(new { error = "Non-zero query parameter 'actorUserId' (Discord user id) is required." });
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

        app.MapGet("/api/wishlist/{id:int}", (int id) =>
        {
            var wishlistService = root.GetRequiredService<WishlistService>();
            var item = wishlistService.GetItem(id);
            return item is null ? Results.NotFound(new { error = "Wishlist item not found." }) : Results.Ok(item);
        });

        app.MapGet("/api/wishlist/items/{id:int}", (int id) =>
        {
            var wishlistService = root.GetRequiredService<WishlistService>();
            var item = wishlistService.GetItem(id);
            return item is null ? Results.NotFound(new { error = "Wishlist item not found." }) : Results.Ok(item);
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
                return Results.BadRequest(new { error = "Query params user1 and user2 are required." });
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

            return Results.Ok(calendarService.GetList(page));
        });

        app.MapGet("/api/calendar/items", (HttpRequest request) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            var page = 0;
            if (int.TryParse(request.Query["page"], out var pageParsed) && pageParsed >= 0)
                page = pageParsed;

            return Results.Ok(calendarService.GetList(page));
        });

        app.MapGet("/api/calendar/{id:int}", (int id) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            var item = calendarService.GetItem(id);
            return item is null ? Results.NotFound(new { error = "Calendar item not found." }) : Results.Ok(item);
        });

        app.MapGet("/api/calendar/items/{id:int}", (int id) =>
        {
            var calendarService = root.GetRequiredService<CalendarService>();
            var item = calendarService.GetItem(id);
            return item is null ? Results.NotFound(new { error = "Calendar item not found." }) : Results.Ok(item);
        });

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
    }

    private static void MapWrites(WebApplication app, IServiceProvider root)
    {
        app.MapPost("/api/buy/items", (HttpRequest http, BuyItemCreateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

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
                return Results.BadRequest(new { error = errMsg });

            var buy = root.GetRequiredService<BuyService>();
            buy.AddItem(
                name,
                body.Quantity ?? "",
                body.Store ?? "",
                body.AssignedTo,
                body.Tags ?? "",
                body.Notes ?? "",
                actor);

            return Results.Created($"/api/buy/items", new { ok = true });
        });

        app.MapPut("/api/buy/items/{id:int}", (int id, BuyItemUpdateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            var errMsg =
                (string.IsNullOrWhiteSpace(body.Name) ? null : Validation.ValidateName(body.Name)) ??
                (string.IsNullOrWhiteSpace(body.Quantity) ? null : Validation.ValidateQuantity(body.Quantity)) ??
                (string.IsNullOrWhiteSpace(body.Store) ? null : Validation.ValidateStore(body.Store)) ??
                (string.IsNullOrWhiteSpace(body.Tags) ? null : Validation.ValidateTags(body.Tags)) ??
                (string.IsNullOrWhiteSpace(body.Notes) ? null : Validation.ValidateNotes(body.Notes));

            if (errMsg != null)
                return Results.BadRequest(new { error = errMsg });

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
                return Results.BadRequest(new { error = "Nothing to update." });
            }

            return Results.Ok(new { ok = true });
        });

        app.MapDelete("/api/buy/items/completed", () =>
        {
            root.GetRequiredService<BuyService>().ClearCompleted();
            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/buy/items/{id:int}/complete", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<BuyService>().CompleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        app.MapDelete("/api/buy/items/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<BuyService>().DeleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/wishlist/items", (HttpRequest http, WishlistItemCreateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var name = body.Name ?? "";
            var nameErr = Validation.ValidateName(name);
            if (nameErr != null)
                return Results.BadRequest(new { error = nameErr });

            var tagErr = Validation.ValidateTags(body.Tags ?? "");
            if (tagErr != null)
                return Results.BadRequest(new { error = tagErr });

            var noteErr = Validation.ValidateNotes(body.Notes ?? "");
            if (noteErr != null)
                return Results.BadRequest(new { error = noteErr });

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

            return Results.Created("/api/wishlist/items", new { ok = true });
        });

        app.MapPut("/api/wishlist/items/{id:int}", (int id, WishlistItemUpdateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            if (!string.IsNullOrWhiteSpace(body.Name))
            {
                var e = Validation.ValidateName(body.Name);
                if (e != null)
                    return Results.BadRequest(new { error = e });
            }

            var tagErr = string.IsNullOrWhiteSpace(body.Tags) ? null : Validation.ValidateTags(body.Tags);
            if (tagErr != null)
                return Results.BadRequest(new { error = tagErr });

            var noteErr = string.IsNullOrWhiteSpace(body.Notes) ? null : Validation.ValidateNotes(body.Notes);
            if (noteErr != null)
                return Results.BadRequest(new { error = noteErr });

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

        app.MapDelete("/api/wishlist/items/completed", () =>
        {
            root.GetRequiredService<WishlistService>().ClearCompleted();
            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/wishlist/items/{id:int}/complete", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<WishlistService>().MarkComplete(id, actor);
            return Results.Ok(new { ok = true });
        });

        app.MapDelete("/api/wishlist/items/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<WishlistService>().DeleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/money/expenses", (MoneyExpenseCreateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            var name = body.Name ?? "";
            var nameErr = Validation.ValidateName(name);
            if (nameErr != null)
                return Results.BadRequest(new { error = nameErr });

            if (body.PaidBy == 0 || body.OwedBy == 0)
                return Results.BadRequest(new { error = "paidBy and owedBy must be non-zero." });

            if (string.IsNullOrWhiteSpace(body.AmountInput))
                return Results.BadRequest(new { error = "amountInput is required." });

            root.GetRequiredService<MoneyService>().AddExpense(name, body.AmountInput, body.PaidBy, body.OwedBy);
            return Results.Created("/api/money/transactions", new { ok = true });
        });

        app.MapPost("/api/money/expenses/split", (MoneyExpenseSplitCreateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            var name = body.Name ?? "";
            var nameErr = Validation.ValidateName(name);
            if (nameErr != null)
                return Results.BadRequest(new { error = nameErr });

            if (body.PaidBy == 0 || body.OwedBy == 0)
                return Results.BadRequest(new { error = "paidBy and owedBy must be non-zero." });

            if (string.IsNullOrWhiteSpace(body.AmountInput))
                return Results.BadRequest(new { error = "amountInput is required." });

            var percent = Math.Clamp(body.Percent, 1, 100);
            root.GetRequiredService<MoneyService>().AddPercentageExpense(
                name,
                body.Description ?? "",
                body.Notes ?? "",
                body.AmountInput,
                body.PaidBy,
                body.OwedBy,
                percent);

            return Results.Created("/api/money/transactions", new { ok = true });
        });

        app.MapPost("/api/money/payments", (MoneyPaymentCreateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            if (body.PaidBy == 0 || body.ReceivedBy == 0)
                return Results.BadRequest(new { error = "paidBy and receivedBy must be non-zero." });

            if (string.IsNullOrWhiteSpace(body.AmountInput))
                return Results.BadRequest(new { error = "amountInput is required." });

            root.GetRequiredService<MoneyService>().AddPayment(body.AmountInput, body.PaidBy, body.ReceivedBy);
            return Results.Created("/api/money/transactions", new { ok = true });
        });

        app.MapPatch("/api/money/transactions/{id:int}", (int id, MoneyTransactionPatchRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<MoneyService>().EditTransaction(
                id,
                body.Name ?? "",
                body.Description ?? "",
                body.Notes ?? "",
                body.AmountInput ?? "");

            return Results.Ok(new { ok = true });
        });

        app.MapDelete("/api/money/transactions/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<MoneyService>().DeleteTransaction(id, actor);
            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/calendar/items", (CalendarItemCreateRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            var title = body.Title ?? "";
            var titleErr = Validation.ValidateName(title);
            if (titleErr != null)
                return Results.BadRequest(new { error = titleErr });

            var start = body.Start ?? "";
            if (!ValidationHelper.ValidateDate(start, out var dateError))
                return Results.BadRequest(new { error = dateError });

            if (!ValidationHelper.ValidateReminder(body.Reminder ?? "", out var reminderError))
                return Results.BadRequest(new { error = reminderError });

            if (!ValidationHelper.ValidateRecurrence(body.Recurrence ?? "", out var recurError))
                return Results.BadRequest(new { error = recurError });

            var config = root.GetRequiredService<ConfigService>();
            var tzValue = config.Get("timezone") ?? "Pacific Standard Time";

            TimeZoneInfo tz;
            try
            {
                tz = TimeZoneInfo.FindSystemTimeZoneById(tzValue);
            }
            catch
            {
                tz = TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
            }

            string type = string.IsNullOrWhiteSpace(start) ? "task" : "event";
            string finalStart = start;
            var parsedStart = DateParser.Parse(start);
            if (parsedStart.HasValue)
            {
                var utc = TimeZoneInfo.ConvertTimeToUtc(parsedStart.Value, tz);
                finalStart = utc.ToString("yyyy-MM-dd HH:mm");
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

            try
            {
                root.GetRequiredService<CalendarService>().AddItem(
                    title,
                    type,
                    finalStart,
                    body.End ?? "",
                    body.AllDay,
                    reminderValue,
                    assignedId,
                    body.Description ?? "",
                    body.Notes ?? "",
                    body.Link ?? "",
                    body.Recurrence ?? "",
                    tzValue);
            }
            catch
            {
                return Results.BadRequest(new { error = "Could not add calendar item." });
            }

            return Results.Created("/api/calendar/items", new { ok = true });
        });

        app.MapPatch("/api/calendar/items/{id:int}", (int id, CalendarItemPatchRequest? body) =>
        {
            if (body is null)
                return Results.BadRequest(new { error = "Request body is required." });

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            if (!string.IsNullOrWhiteSpace(body.Title))
            {
                var e = Validation.ValidateName(body.Title);
                if (e != null)
                    return Results.BadRequest(new { error = e });
            }

            root.GetRequiredService<CalendarService>().EditItem(
                id,
                body.Title ?? "",
                body.Start ?? "",
                body.End ?? "",
                body.Description ?? "",
                body.Notes ?? "",
                body.Link ?? "");

            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/calendar/items/{id:int}/complete", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<CalendarService>().CompleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        app.MapDelete("/api/calendar/items/{id:int}", (HttpRequest http, int id) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var idErr = Validation.ValidateId(id);
            if (idErr != null)
                return Results.BadRequest(new { error = idErr });

            root.GetRequiredService<CalendarService>().DeleteItem(id, actor);
            return Results.Ok(new { ok = true });
        });

        app.MapPost("/api/undo", (HttpRequest http) =>
        {
            if (!TryActor(http.Query, out var actor, out var err))
                return err!;

            var result = root.GetRequiredService<UndoService>().ApplyLastUndo(actor);

            if (result.IsNothingToUndo)
                return Results.Ok(new { undone = false, message = result.Message });

            if (!result.IsSuccess)
                return Results.BadRequest(new { error = result.Message });

            return Results.Ok(new { undone = true });
        });
    }
}
