using Microsoft.Extensions.DependencyInjection;

/// <summary>Discord channel notifications for budget API mutations (mirrors buy/money web notify).</summary>
internal static class BudgetApiDiscordNotify
{
    public static async ValueTask NotifyAsync(IServiceProvider root, string markdown)
    {
        await root.GetRequiredService<IDiscordChannelNotifier>()
            .NotifyFeatureChannelAsync("budget", markdown);
    }

    public static async ValueTask TransactionCreatedAsync(
        IServiceProvider root,
        BudgetService svc,
        string type,
        string amountInput,
        int? categoryId,
        ulong spentByUserId)
    {
        var cat = categoryId.HasValue
            ? svc.GetCategories().FirstOrDefault(c => c.Id == categoryId.Value)?.Name ?? "?"
            : "(none)";
        var safeType = type.Equals("income", StringComparison.OrdinalIgnoreCase) ? "income" : "expense";
        var amt = DiscordNotifyText.SanitizeInline(amountInput);
        await NotifyAsync(
            root,
            $"📊 **Budget** (via web): {safeType} **{DiscordNotifyText.SanitizeInline(cat)}** `${amt}` by <@{spentByUserId}>");
    }

    public static async ValueTask TransferCreatedAsync(
        IServiceProvider root,
        BudgetService svc,
        string amountInput,
        int fromAccountId,
        int toAccountId,
        ulong actor)
    {
        var accounts = svc.GetAccounts();
        var from = accounts.FirstOrDefault(a => a.Id == fromAccountId)?.Name ?? $"#{fromAccountId}";
        var to = accounts.FirstOrDefault(a => a.Id == toAccountId)?.Name ?? $"#{toAccountId}";
        var amt = DiscordNotifyText.SanitizeInline(amountInput);
        await NotifyAsync(
            root,
            $"📊 **Budget** (via web): transfer `${amt}` **{DiscordNotifyText.SanitizeInline(from)}** → **{DiscordNotifyText.SanitizeInline(to)}** (<@{actor}>)");
    }

    public static async ValueTask BillPaidAsync(IServiceProvider root, BudgetService svc, int billId, string amountInput, ulong spender)
    {
        var bill = svc.GetBills(false).FirstOrDefault(b => b.Id == billId);
        var name = bill?.Name ?? $"bill #{billId}";
        var amt = DiscordNotifyText.SanitizeInline(amountInput);
        await NotifyAsync(
            root,
            $"📊 **Budget** (via web): paid bill **{DiscordNotifyText.SanitizeInline(name)}** `${amt}` (<@{spender}>)");
    }

    public static async ValueTask BillCreatedAsync(IServiceProvider root, string name, int dueDay, bool calendarLinked)
    {
        var extra = calendarLinked ? " (+ calendar reminder)" : "";
        await NotifyAsync(
            root,
            $"📊 **Budget** (via web): new bill **{DiscordNotifyText.SanitizeInline(name)}** (due day {dueDay}){extra}");
    }

    public static async ValueTask CsvImportedAsync(IServiceProvider root, int count, ulong actor)
    {
        await NotifyAsync(root, $"📊 **Budget** (via web): imported **{count}** transaction(s) (<@{actor}>)");
    }
}
