using Discord;
using Discord.Interactions;

/// <summary>Discord slash commands for household budgeting.</summary>
public class BudgetCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly BudgetService _budget;
    private readonly IDiscordChannelNotifier _notifier;

    public BudgetCommands(BudgetService budget, IDiscordChannelNotifier notifier)
    {
        _budget = budget;
        _notifier = notifier;
    }

    [SlashCommand("budget-add", "Log a budget expense or income")]
    public async Task Add(
        string amount,
        string category,
        string type = "expense",
        string? note = null,
        IUser? spentBy = null)
    {
        var spender = spentBy ?? Context.User;
        var cats = _budget.GetCategories();
        var cat = cats.FirstOrDefault(c =>
            c.Name.Equals(category, StringComparison.OrdinalIgnoreCase))
                  ?? cats.FirstOrDefault(c =>
                      c.Name.Contains(category, StringComparison.OrdinalIgnoreCase));

        if (cat == null)
        {
            await RespondAsync($"Unknown category **{category}**. Create it in the Web UI first.", ephemeral: true);
            return;
        }

        var txType = type.Equals("income", StringComparison.OrdinalIgnoreCase) ? "income" : "expense";
        _budget.CreateTransaction(
            txType,
            amount,
            cat.Id,
            spender.Id,
            DateTime.UtcNow.ToString("yyyy-MM-dd"),
            note,
            null,
            null,
            false,
            "USD",
            1,
            null,
            null,
            Context.User.Id);

        await RespondAsync(
            $"📊 Logged **{txType}** ${amount} — **{cat.Name}** (<@{spender.Id}>)");

        await _notifier.NotifyFeatureChannelAsync(
            "budget",
            $"📊 **Budget** (Discord): {txType} **{cat.Name}** `${amount}` by <@{spender.Id}>");
    }

    [SlashCommand("budget-summary", "Quick budget summary for this month")]
    public async Task Summary()
    {
        var month = DateTime.UtcNow.ToString("yyyy-MM");
        var s = _budget.GetMonthSummary(month, null, null, null);
        var top = _budget.GetSummaryByCategory(month, null, null).Take(3).ToList();
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"**{month}** — Income: ${s.TotalIncome:N2} | Expenses: ${s.TotalExpenses:N2} | Net: ${s.Net:N2}");
        if (top.Count > 0)
        {
            sb.AppendLine("Top categories:");
            foreach (var t in top)
                sb.AppendLine($"• {t.Label}: ${t.Total:N2}");
        }

        await RespondAsync(sb.ToString());
    }

    [SlashCommand("budget-digest", "Post budget digest to the budget channel")]
    public async Task Digest(bool monthly = false)
    {
        var text = _budget.BuildDigestText(monthly);
        await _notifier.NotifyFeatureChannelAsync("budget", text);
        await RespondAsync("Digest sent to the budget channel.", ephemeral: true);
    }

    [SlashCommand("budget-list", "Month summary, envelope warnings, and upcoming bills")]
    public async Task List()
    {
        var month = DateTime.UtcNow.ToString("yyyy-MM");
        var s = _budget.GetMonthSummary(month, null, null, "household");
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"**{month}** — Income ${s.TotalIncome:N2} · Expenses ${s.TotalExpenses:N2} · Net ${s.Net:N2}");

        var envWarnings = _budget.GetEnvelopes(month, null)
            .Where(e => e.TargetAmount > 0 && e.PercentUsed >= 85)
            .OrderByDescending(e => e.PercentUsed)
            .Take(8)
            .ToList();
        if (envWarnings.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("**Envelopes:**");
            foreach (var e in envWarnings)
                sb.AppendLine($"• {e.CategoryName}: {e.PercentUsed}% of ${e.TargetAmount:N0}");
        }

        var alerts = _budget.CollectPendingNotifications();
        var bills = alerts.Where(a => a.Kind == "bill_due").Take(6).ToList();
        if (bills.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("**Bills:**");
            foreach (var b in bills)
                sb.AppendLine($"• {b.Message}");
        }

        if (envWarnings.Count == 0 && bills.Count == 0)
            sb.AppendLine();
        sb.AppendLine("_Use the Web UI for full budget planning._");

        await RespondAsync(sb.ToString());
    }
}
