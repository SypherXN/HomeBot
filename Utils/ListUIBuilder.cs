using Discord;

/// <summary>
/// Shared helpers for building list embeds and interaction button rows.
/// </summary>
public static class ListUIBuilder
{
    /// <summary>
    /// Builds a list embed with one row per field.
    /// </summary>
    public static Embed BuildEmbed(string title, List<string> rows)
    {
        var embed = new EmbedBuilder()
            .WithTitle(title)
            .WithColor(Color.Green);

        if (rows.Count == 0)
        {
            embed.Description = "Nothing here 🎉";
            return embed.Build();
        }

        foreach (var row in rows)
        {
            embed.AddField("\u200B", row);
        }

        return embed.Build();
    }

    /// <summary>
    /// Builds complete/delete and pagination buttons for list views.
    /// </summary>
    public static MessageComponent BuildButtons(
        List<int> ids,
        string feature,
        int page,
        bool hasNext,
        bool hasPrev)
    {
        var builder = new ComponentBuilder();

        foreach (var id in ids)
        {
            builder.WithButton($"✔ {id}", $"{feature}_complete_{id}", ButtonStyle.Success);
            builder.WithButton($"✖ {id}", $"{feature}_delete_{id}", ButtonStyle.Danger);
        }

        if (hasPrev)
        {
            builder.WithButton("⬅ Prev", $"{feature}_page_{page - 1}", ButtonStyle.Secondary);
        }

        if (hasNext)
        {
            builder.WithButton("Next ➡", $"{feature}_page_{page + 1}", ButtonStyle.Secondary);
        }

        return builder.Build();
    }
}