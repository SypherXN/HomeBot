using Discord;

/// <summary>
/// Discord embeds and buttons for the wishlist. Domain reads stay on <see cref="WishlistService"/>.
/// </summary>
public static class WishlistListDiscordPresentation
{
    public static Task<(Embed embed, MessageComponent components)> BuildWishlist(
        WishlistService wishlist,
        ulong? owner = null,
        string tag = "",
        string sort = "",
        int page = 0)
    {
        var result = wishlist.GetWishlist(owner, tag, sort, page);
        var rows = result.Items.Select(FormatRow).ToList();
        var ids = result.Items.Select(x => x.Id).ToList();

        var embed = ListUIBuilder.BuildEmbed("🎁 Wishlist", rows);

        var components = ListUIBuilder.BuildButtons(
            ids,
            "wishlist",
            page,
            result.HasNext,
            result.HasPrev
        );

        return Task.FromResult((embed, components));
    }

    private static string FormatRow(WishlistListItemModel item)
    {
        var line = $"**#{item.Id} {item.Name}** | 👤 <@{item.Owner}>";

        if (!string.IsNullOrWhiteSpace(item.Price))
            line += $" | 💲 {item.Price}";

        if (!string.IsNullOrWhiteSpace(item.Priority))
            line += $" | ⭐ {item.Priority}";

        if (item.Tags.Count > 0)
        {
            var formattedTags = string.Join(" ", item.Tags.Select(t => $"#{t}"));
            line += $" | 🏷 {formattedTags}";
        }

        if (item.PurchasedBy.HasValue)
            line += $" | ✔ <@{item.PurchasedBy.Value}>";

        return line;
    }
}
