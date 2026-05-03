using Discord;

/// <summary>
/// Discord embeds and buttons for money summaries and transactions. Domain stays on <see cref="MoneyService"/>.
/// </summary>
public static class MoneyDiscordPresentation
{
    public static Task<Embed> BuildSummary(
        MoneyService money,
        ulong user1,
        ulong user2,
        string name1,
        string name2)
    {
        var summary = money.GetSummary(user1, user2, name1, name2);

        var embed = new EmbedBuilder()
            .WithTitle("💰 Money Summary")
            .WithColor(Color.Gold);

        if (summary.Balance > 0)
        {
            embed.Description = $"👉 {summary.User2Name} owes {summary.User1Name} **${summary.Balance:F2}**";
        }
        else if (summary.Balance < 0)
        {
            embed.Description = $"👉 {summary.User1Name} owes {summary.User2Name} **${Math.Abs(summary.Balance):F2}**";
        }
        else
        {
            embed.Description = $"✅ {summary.User1Name} and {summary.User2Name} are settled up";
        }

        return Task.FromResult(embed.Build());
    }

    public static Task<Embed> BuildOverallSummary(MoneyService money, ulong userId, string username)
    {
        var balances = money.GetAllBalances(userId);

        var embed = new EmbedBuilder()
            .WithTitle("💰 Your Balance Summary")
            .WithColor(Color.Gold);

        if (balances.Count == 0)
        {
            embed.Description = "No transactions yet.";
            return Task.FromResult(embed.Build());
        }

        foreach (var entry in balances)
        {
            var otherUserId = entry.Key;
            var amount = entry.Value;

            string line;

            if (amount > 0)
                line = $"<@{otherUserId}> owes you **${amount:F2}**";
            else if (amount < 0)
                line = $"You owe <@{otherUserId}> **${Math.Abs(amount):F2}**";
            else
                line = $"You and <@{otherUserId}> are settled";

            embed.AddField("\u200B", line);
        }

        return Task.FromResult(embed.Build());
    }

    public static Task<(Embed embed, MessageComponent components)> BuildTransactions(MoneyService money, int page = 0)
    {
        var result = money.GetTransactions(page);
        var rows = result.Items.Select(FormatTransactionRow).ToList();
        var ids = result.Items.Select(x => x.Id).ToList();

        var embed = ListUIBuilder.BuildEmbed("📜 Transactions", rows);

        var components = new ComponentBuilder();

        foreach (var id in ids)
        {
            components.WithButton(
                $"❌ {id}",
                $"money_delete_{id}",
                ButtonStyle.Danger
            );
        }

        if (result.HasPrev)
        {
            components.WithButton("⬅ Prev", $"money_page_{page - 1}", ButtonStyle.Secondary);
        }

        if (result.HasNext)
        {
            components.WithButton("Next ➡", $"money_page_{page + 1}", ButtonStyle.Secondary);
        }

        return Task.FromResult((embed, components.Build()));
    }

    private static string FormatTransactionRow(MoneyTransactionListItemModel item)
    {
        if (item.Type == "expense")
        {
            return $"💸 **#{item.Id} {item.Name}** | ${item.Amount:F2} | <@{item.PaidBy}> → <@{item.OwedBy}>";
        }

        return $"💰 **#{item.Id} Payment** | ${item.Amount:F2} | <@{item.PaidBy}> → <@{item.OwedBy}>";
    }
}
