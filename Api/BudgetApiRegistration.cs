using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

/// <summary>Registers <c>/api/budget/*</c> routes.</summary>
public static class BudgetApiRegistration
{
    public static void MapBudgetApi(this WebApplication app, IServiceProvider root)
    {
        MapBudgetReads(app, root);
        MapBudgetWrites(app, root);
    }

    private static void MapBudgetReads(WebApplication app, IServiceProvider root)
    {
        app.MapGet("/api/budget/categories", () => Results.Ok(root.GetRequiredService<BudgetService>().GetCategories()));

        app.MapGet("/api/budget/accounts", (HttpRequest request) =>
        {
            var includeInactive = string.Equals(request.Query["includeInactive"], "true", StringComparison.OrdinalIgnoreCase);
            return Results.Ok(root.GetRequiredService<BudgetService>().GetAccounts(activeOnly: !includeInactive));
        });

        app.MapGet("/api/budget/tags", () => Results.Ok(root.GetRequiredService<BudgetService>().GetAllTags()));

        app.MapGet("/api/budget/transactions", (HttpRequest request) =>
        {
            var svc = root.GetRequiredService<BudgetService>();
            int page = int.TryParse(request.Query["page"], out var p) ? p : 0;
            ulong? user = ulong.TryParse(request.Query["spentByUserId"], out var u) && u != 0 ? u : null;
            int? cat = int.TryParse(request.Query["categoryId"], out var c) ? c : null;
            int? acc = int.TryParse(request.Query["accountId"], out var a) ? a : null;
            double? min = double.TryParse(request.Query["amountMin"], out var mn) ? mn : null;
            double? max = double.TryParse(request.Query["amountMax"], out var mx) ? mx : null;
            return Results.Ok(svc.GetTransactions(
                page,
                request.Query["month"],
                user,
                cat,
                request.Query["scope"],
                request.Query["merchant"],
                request.Query["noteContains"],
                min,
                max,
                request.Query["tag"],
                acc));
        });

        app.MapGet("/api/budget/summary/month", (HttpRequest request) =>
        {
            var svc = root.GetRequiredService<BudgetService>();
            ulong? user = ulong.TryParse(request.Query["spentByUserId"], out var u) && u != 0 ? u : null;
            int? cat = int.TryParse(request.Query["categoryId"], out var c) ? c : null;
            return Results.Ok(svc.GetMonthSummary(request.Query["month"], user, cat, request.Query["scope"]));
        });

        app.MapGet("/api/budget/summary/by-category", (HttpRequest request) =>
        {
            var svc = root.GetRequiredService<BudgetService>();
            ulong? user = ulong.TryParse(request.Query["spentByUserId"], out var u) && u != 0 ? u : null;
            return Results.Ok(svc.GetSummaryByCategory(request.Query["month"], user, request.Query["scope"]));
        });

        app.MapGet("/api/budget/summary/by-user", (HttpRequest request) =>
        {
            var svc = root.GetRequiredService<BudgetService>();
            int? cat = int.TryParse(request.Query["categoryId"], out var c) ? c : null;
            return Results.Ok(svc.GetSummaryByUser(request.Query["month"], cat, request.Query["scope"]));
        });

        app.MapGet("/api/budget/envelopes", (HttpRequest request) =>
        {
            var svc = root.GetRequiredService<BudgetService>();
            ulong? user = ulong.TryParse(request.Query["spentByUserId"], out var u) && u != 0 ? u : null;
            var month = request.Query["month"].ToString();
            if (string.IsNullOrWhiteSpace(month))
                return ApiResults.BadRequest("month query (YYYY-MM) is required.", "missing_month");
            return Results.Ok(svc.GetEnvelopes(month, user));
        });

        app.MapGet("/api/budget/goals", () => Results.Ok(root.GetRequiredService<BudgetService>().GetGoals()));

        app.MapGet("/api/budget/income-plan", (HttpRequest request) =>
            Results.Ok(root.GetRequiredService<BudgetService>().GetIncomePlan(request.Query["month"])));

        app.MapGet("/api/budget/forecast", (HttpRequest request) =>
            Results.Ok(root.GetRequiredService<BudgetService>().GetForecast(request.Query["month"])));

        app.MapGet("/api/budget/trends", (HttpRequest request) =>
        {
            int months = int.TryParse(request.Query["months"], out var m) ? m : 12;
            var groupBy = request.Query["groupBy"].ToString();
            if (string.IsNullOrWhiteSpace(groupBy)) groupBy = "category";
            return Results.Ok(root.GetRequiredService<BudgetService>().GetTrends(months, groupBy));
        });

        app.MapGet("/api/budget/recurring", () => Results.Ok(root.GetRequiredService<BudgetService>().GetRecurring()));

        app.MapGet("/api/budget/bills", () => Results.Ok(root.GetRequiredService<BudgetService>().GetBills()));

        app.MapGet("/api/budget/audit", (HttpRequest request) =>
        {
            int limit = int.TryParse(request.Query["limit"], out var l) ? l : 100;
            return Results.Ok(root.GetRequiredService<BudgetService>().GetAuditLog(limit));
        });

        app.MapGet("/api/budget/notifications", () =>
            Results.Ok(root.GetRequiredService<BudgetService>().CollectPendingNotifications()));

        app.MapGet("/api/budget/exchange-rates", () =>
            Results.Ok(root.GetRequiredService<BudgetService>().GetExchangeRates()));

        app.MapGet("/api/budget/tax-summary", (HttpRequest request) =>
        {
            int year = int.TryParse(request.Query["year"], out var y) ? y : DateTime.UtcNow.Year;
            return Results.Ok(root.GetRequiredService<BudgetService>().GetTaxSummary(year));
        });

        app.MapGet("/api/budget/export.csv", (HttpRequest request) =>
        {
            var csv = root.GetRequiredService<BudgetService>().ExportCsv(
                request.Query["from"],
                request.Query["to"]);
            return Results.Text(csv, "text/csv");
        });
    }

    private static void MapBudgetWrites(WebApplication app, IServiceProvider root)
    {
        var w = app.MapGroup("/api").RequireRateLimiting("mutation");

        w.MapPost("/budget/categories", (HttpRequest http, BudgetCategoryCreateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Name))
                return ApiResults.BadRequest("name is required.", "missing_name");
            var id = root.GetRequiredService<BudgetService>().CreateCategory(
                body.Name, body.Color, body.Icon, body.Visibility ?? "household", body.IsTaxDeductible, actor);
            return Results.Created($"/api/budget/categories/{id}", new { id });
        });

        w.MapPatch("/budget/categories/{id:int}", (HttpRequest http, int id, BudgetCategoryUpdateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Name))
                return ApiResults.BadRequest("name is required.", "missing_name");
            var ok = root.GetRequiredService<BudgetService>().UpdateCategory(
                id, body.Name, body.Color, body.Icon, body.Visibility ?? "household", body.IsTaxDeductible, actor);
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Category not found.", "not_found");
        });

        w.MapDelete("/budget/categories/{id:int}", (HttpRequest http, int id) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            var ok = root.GetRequiredService<BudgetService>().DeleteCategory(id, actor);
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Category not found.", "not_found");
        });

        w.MapPost("/budget/transactions", async (HttpRequest http, BudgetTransactionCreateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.AmountInput))
                return ApiResults.BadRequest("amountInput is required.", "missing_amount");
            if (body.SpentByUserId == 0)
                return ApiResults.BadRequest("spentByUserId is required.", "missing_spender");
            var date = string.IsNullOrWhiteSpace(body.TransactionDate)
                ? DateTime.UtcNow.ToString("yyyy-MM-dd")
                : body.TransactionDate;
            var svc = root.GetRequiredService<BudgetService>();
            var rate = body.ExchangeRateToHome <= 0 ? 1 : body.ExchangeRateToHome;
            if (!string.IsNullOrWhiteSpace(body.Currency) && body.Currency != "USD")
                rate = svc.ResolveExchangeRateToHome(body.Currency, "USD", date);
            var txType = body.Type ?? "expense";
            var id = svc.CreateTransaction(
                txType,
                body.AmountInput,
                body.CategoryId,
                body.SpentByUserId,
                date,
                body.Note,
                body.Merchant,
                body.AccountId,
                body.IsPending,
                body.Currency ?? "USD",
                rate,
                body.Splits,
                body.Tags,
                actor);
            await BudgetApiDiscordNotify.TransactionCreatedAsync(
                root, svc, txType, body.AmountInput, body.CategoryId, body.SpentByUserId);
            return Results.Created($"/api/budget/transactions/{id}", new { id });
        });

        w.MapPost("/budget/transfers", async (HttpRequest http, BudgetTransferCreateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            var svc = root.GetRequiredService<BudgetService>();
            var id = svc.CreateTransfer(
                body.AmountInput,
                body.FromAccountId,
                body.ToAccountId,
                body.TransactionDate ?? DateTime.UtcNow.ToString("yyyy-MM-dd"),
                body.Note,
                actor);
            await BudgetApiDiscordNotify.TransferCreatedAsync(
                root, svc, body.AmountInput, body.FromAccountId, body.ToAccountId, actor);
            return Results.Created($"/api/budget/transactions/{id}", new { id });
        });

        w.MapPatch("/budget/transactions/{id:int}", (HttpRequest http, int id, BudgetTransactionUpdateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            var ok = root.GetRequiredService<BudgetService>().UpdateTransaction(
                id,
                body.AmountInput,
                body.CategoryId,
                body.SpentByUserId,
                body.TransactionDate,
                body.Note,
                body.Merchant,
                body.IsPending,
                body.ClearedAt,
                body.Splits,
                body.Tags,
                body.AccountId,
                applyAccountId: body.AccountId.HasValue,
                actor);
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Transaction not found.", "not_found");
        });

        w.MapPatch("/budget/accounts/{id:int}", (HttpRequest http, int id, BudgetAccountUpdateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || !body.IsActive.HasValue)
                return ApiResults.BadRequest("isActive is required.", "missing_fields");
            var ok = root.GetRequiredService<BudgetService>().SetAccountActive(id, body.IsActive.Value, actor);
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Account not found.", "not_found");
        });

        w.MapDelete("/budget/transactions/{id:int}", (HttpRequest http, int id) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            root.GetRequiredService<BudgetService>().DeleteTransaction(id, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPut("/budget/envelopes", (HttpRequest http, BudgetEnvelopeSetRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Month))
                return ApiResults.BadRequest("month and categoryId required.", "missing_fields");
            root.GetRequiredService<BudgetService>().SetEnvelope(body.Month, body.CategoryId, body.TargetAmount, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/budget/goals", (HttpRequest http, BudgetGoalCreateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Name))
                return ApiResults.BadRequest("name required.", "missing_name");
            var id = root.GetRequiredService<BudgetService>().CreateGoal(
                body.Name, body.TargetAmount, body.CurrentAmount, body.TargetDate, body.CategoryId, actor);
            return Results.Created($"/api/budget/goals/{id}", new { id });
        });

        w.MapPatch("/budget/goals/{id:int}", (HttpRequest http, int id, BudgetGoalUpdateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            var ok = root.GetRequiredService<BudgetService>().UpdateGoal(
                id, body.Name, body.TargetAmount, body.CurrentAmount, body.TargetDate, body.CategoryId, actor);
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Goal not found.", "not_found");
        });

        w.MapDelete("/budget/goals/{id:int}", (HttpRequest http, int id) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            var ok = root.GetRequiredService<BudgetService>().DeleteGoal(id, actor);
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Goal not found.", "not_found");
        });

        w.MapPut("/budget/income-plan", (HttpRequest http, BudgetIncomePlanSetRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Month))
                return ApiResults.BadRequest("month required.", "missing_month");
            root.GetRequiredService<BudgetService>().SetIncomePlan(body.Month, body.PlannedAmount, actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/budget/recurring", (HttpRequest http, BudgetRecurringCreateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            var id = root.GetRequiredService<BudgetService>().CreateRecurring(
                body.AmountInput,
                body.CategoryId,
                body.SpentByUserId,
                body.Cadence ?? "monthly",
                body.NextRunDate ?? DateTime.UtcNow.ToString("yyyy-MM-dd"),
                body.Type ?? "expense",
                body.Note,
                body.Merchant,
                body.AccountId,
                actor);
            return Results.Created($"/api/budget/recurring/{id}", new { id });
        });

        w.MapPost("/budget/bills", async (HttpRequest http, BudgetBillCreateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Name))
                return ApiResults.BadRequest("name required.", "missing_name");
            var svc = root.GetRequiredService<BudgetService>();
            int? calId = body.CalendarItemId;
            var linkedCalendar = false;
            if (body.CreateCalendarReminder && !calId.HasValue)
            {
                calId = BudgetBillCalendarHelper.CreateMonthlyReminder(
                    root, body.Name.Trim(), body.AmountEstimate, body.DueDay);
                linkedCalendar = true;
            }

            var id = svc.CreateBill(
                body.Name, body.AmountEstimate, body.DueDay, body.CategoryId, calId, actor);
            await BudgetApiDiscordNotify.BillCreatedAsync(root, body.Name.Trim(), body.DueDay, linkedCalendar);
            return Results.Created($"/api/budget/bills/{id}", new { id, calendarItemId = calId });
        });

        w.MapPost("/budget/bills/{id:int}/calendar-reminder", async (HttpRequest http, int id) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            var svc = root.GetRequiredService<BudgetService>();
            var bill = svc.GetBills(false).FirstOrDefault(b => b.Id == id);
            if (bill is null)
                return ApiResults.NotFound("Bill not found.", "not_found");
            if (bill.CalendarItemId.HasValue)
                return ApiResults.BadRequest("Bill already has a calendar reminder.", "already_linked");

            var calId = BudgetBillCalendarHelper.CreateMonthlyReminder(
                root, bill.Name, bill.AmountEstimate, bill.DueDay);
            if (!svc.SetBillCalendarItem(id, calId, actor))
                return ApiResults.NotFound("Bill not found.", "not_found");

            var sTitle = DiscordNotifyText.SanitizeInline($"Bill due: {bill.Name}");
            await root.GetRequiredService<IDiscordChannelNotifier>().NotifyFeatureChannelAsync(
                "calendar",
                $"📅 **Calendar** (via web): added **{sTitle}** (monthly bill reminder)");

            return Results.Ok(new { ok = true, calendarItemId = calId });
        });

        w.MapPost("/budget/bills/{id:int}/pay", async (HttpRequest http, int id, BudgetBillPayRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.AmountInput))
                return ApiResults.BadRequest("amountInput required.", "missing_amount");
            var svc = root.GetRequiredService<BudgetService>();
            var spender = body.SpentByUserId != 0 ? body.SpentByUserId : actor;
            var txId = svc.MarkBillPaid(id, body.AmountInput, spender, actor);
            await BudgetApiDiscordNotify.BillPaidAsync(root, svc, id, body.AmountInput, spender);
            return Results.Ok(new { transactionId = txId });
        });

        w.MapPatch("/budget/bills/{id:int}", (HttpRequest http, int id, BudgetBillUpdateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            var svc = root.GetRequiredService<BudgetService>();
            var ok = svc.UpdateBill(id, body.Name, body.AmountEstimate, body.DueDay, body.CategoryId, actor);
            if (body.IsActive.HasValue)
                ok = svc.SetBillActive(id, body.IsActive.Value, actor) || ok;
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Bill not found.", "not_found");
        });

        w.MapPatch("/budget/recurring/{id:int}", (HttpRequest http, int id, BudgetRecurringUpdateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            var svc = root.GetRequiredService<BudgetService>();
            var ok = svc.UpdateRecurring(
                id, body.AmountInput, body.CategoryId, body.SpentByUserId,
                body.Cadence, body.NextRunDate, body.Type, body.Note, body.Merchant, actor);
            if (body.IsActive.HasValue)
                ok = svc.SetRecurringActive(id, body.IsActive.Value, actor) || ok;
            return ok ? Results.Ok(new { ok = true }) : ApiResults.NotFound("Recurring rule not found.", "not_found");
        });

        w.MapPost("/budget/accounts", (HttpRequest http, BudgetAccountCreateRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null || string.IsNullOrWhiteSpace(body.Name))
                return ApiResults.BadRequest("name required.", "missing_name");
            var id = root.GetRequiredService<BudgetService>().CreateAccount(
                body.Name, body.AccountType ?? "checking", body.Currency ?? "USD", body.CreditLimit, actor);
            return Results.Created($"/api/budget/accounts/{id}", new { id });
        });

        w.MapPut("/budget/exchange-rates", (HttpRequest http, BudgetExchangeRateSetRequest? body) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            if (body is null)
                return ApiResults.BadRequest("body required.", "missing_body");
            root.GetRequiredService<BudgetService>().SetExchangeRate(
                body.FromCurrency, body.ToCurrency, body.Rate,
                body.EffectiveDate ?? DateTime.UtcNow.ToString("yyyy-MM-dd"), actor);
            return Results.Ok(new { ok = true });
        });

        w.MapPost("/budget/import.csv", async (HttpRequest http) =>
        {
            if (!HomeBotApiRegistrationTryActor.TryActor(http.Query, out var actor, out var err))
                return err!;
            var form = await http.ReadFormAsync();
            var file = form.Files.FirstOrDefault();
            if (file == null)
                return ApiResults.BadRequest("csv file required.", "missing_file");
            using var reader = new StreamReader(file.OpenReadStream());
            var csv = await reader.ReadToEndAsync();
            ulong spender = ulong.TryParse(form["spentByUserId"], out var u) && u != 0 ? u : actor;
            var count = root.GetRequiredService<BudgetService>().ImportCsv(csv, spender, actor);
            if (count > 0)
                await BudgetApiDiscordNotify.CsvImportedAsync(root, count, actor);
            return Results.Ok(new { imported = count });
        });
    }
}

/// <summary>Shared actor validation for budget routes (mirrors HomeBotApiRegistration).</summary>
public static class HomeBotApiRegistrationTryActor
{
    public static bool TryActor(IQueryCollection query, out ulong actor, out IResult? error)
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
}
