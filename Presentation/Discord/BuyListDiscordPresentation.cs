using Discord;

/// <summary>
/// Discord embeds and buttons for the buy list. Domain reads stay on <see cref="BuyService"/>.
/// </summary>
public static class BuyListDiscordPresentation
{
    public static Task<(Embed embed, MessageComponent components)> BuildBuyList(
        BuyService buy,
        ulong? assignedTo = null,
        string store = "",
        string tag = "",
        string sort = "",
        int page = 0)
    {
        var result = buy.GetBuyList(assignedTo, store, tag, sort, page);
        var rows = result.Items.Select(FormatRow).ToList();
        var ids = result.Items.Select(x => x.Id).ToList();

        var embed = ListUIBuilder.BuildEmbed("🛒 Things To Buy", rows);
        var components = ListUIBuilder.BuildButtons(ids, "buy", page, result.HasNext, result.HasPrev);

        return Task.FromResult((embed, components));
    }

    private static string FormatRow(BuyListItemModel item)
    {
        string FormatCell(string value, int width)
        {
            if (string.IsNullOrWhiteSpace(value))
                value = "-";

            if (value.Length > width)
                return value.Substring(0, width - 3) + "...";

            return value.PadRight(width);
        }

        var assigned = item.AssignedTo.HasValue ? $"<@{item.AssignedTo.Value}>" : "anyone";
        var storeDisplay = string.IsNullOrWhiteSpace(item.Store) ? "-" : item.Store;

        var line =
            $"`{item.Id.ToString().PadRight(3)}` " +
            $"{FormatCell(item.Name, 18)} " +
            $"📦 {FormatCell(item.Quantity, 8)} " +
            $"🏬 {FormatCell(storeDisplay, 10)} " +
            $"👤 {assigned}";

        if (item.Tags.Count > 0)
        {
            var formattedTags = string.Join(" ", item.Tags.Select(t => $"#{t}"));
            line += $" | 🏷 {formattedTags}";
        }

        if (!string.IsNullOrWhiteSpace(item.Notes))
            line += $" | 📝 {item.Notes}";

        if (item.PurchasedBy.HasValue)
            line += $" | ✔ <@{item.PurchasedBy.Value}>";

        return line;
    }
}
