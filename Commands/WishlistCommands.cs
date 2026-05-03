using Discord;
using Discord.Interactions;

/// <summary>
/// Slash commands for wishlist CRUD, completion, and filtering flows.
/// </summary>
public class WishlistCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly WishlistService _wishlist;

    public WishlistCommands(WishlistService wishlist)
    {
        _wishlist = wishlist;
    }

    /// <summary>
    /// Adds a new wishlist item for the provided owner or the current user.
    /// </summary>
    [SlashCommand("wishlist-add", "Add item to wishlist")]
    public async Task Add(
        string name,
        IUser? owner = null,
        string price = "",
        string link = "",
        string description = "",
        string notes = "",
        string priority = "",
        string tags = "")
    {
        var targetUser = owner ?? Context.User;

        string normalizedPriority = "";

        if (!string.IsNullOrWhiteSpace(priority))
        {
            if (int.TryParse(priority, out int p))
            {
                p = Math.Clamp(p, 1, 3);
                normalizedPriority = p.ToString();
            }
        }

        _wishlist.AddItem(name, targetUser.Id, price, link, description, notes, normalizedPriority, tags);

        await RespondAsync($"🎁 Added **{name}** to <@{targetUser.Id}>'s wishlist");
    }

    /// <summary>
    /// Lists wishlist items with optional owner/tag/sort filters.
    /// </summary>
    [SlashCommand("wishlist-list", "View wishlist")]
    public async Task List(
        IUser? owner = null,
        string tag = "",
        string sort = "")
    {
        var (embed, components) = await WishlistListDiscordPresentation.BuildWishlist(
            _wishlist,
            owner?.Id,
            tag,
            sort
        );

        await RespondAsync(embed: embed, components: components);
    }

    /// <summary>
    /// Shows full details for a specific wishlist item.
    /// </summary>
    [SlashCommand("wishlist-view", "View full item details")]
    public async Task View(int id)
    {
        var item = _wishlist.GetItem(id);

        if (item == null)
        {
            await RespondAsync("❌ Item not found");
            return;
        }

        var embed = new EmbedBuilder()
            .WithTitle($"🎁 {item.Name}")
            .WithColor(Color.Purple)
            .AddField("Owner", $"<@{item.Owner}>", true);

        if (!string.IsNullOrWhiteSpace(item.Price))
            embed.AddField("Price", item.Price, true);

        if (!string.IsNullOrWhiteSpace(item.Priority))
            embed.AddField("Priority", item.Priority, true);

        if (!string.IsNullOrWhiteSpace(item.Description))
            embed.AddField("Description", item.Description);

        if (!string.IsNullOrWhiteSpace(item.Notes))
            embed.AddField("Notes", item.Notes);

        var components = new ComponentBuilder();

        if (!string.IsNullOrWhiteSpace(item.Link))
        {
            components.WithButton(
                "🔗 View Item",
                style: ButtonStyle.Link,
                url: item.Link
            );
        }

        await RespondAsync(embed: embed.Build(), components: components.Build());
    }

    /// <summary>
    /// Marks a wishlist item as purchased.
    /// </summary>
    [SlashCommand("wishlist-complete", "Mark item as purchased")]
    public async Task Complete(int id)
    {
        _wishlist.MarkComplete(id, Context.User.Id);
        await RespondAsync("✔ Item marked as purchased");
    }

    /// <summary>
    /// Deletes one wishlist item by id.
    /// </summary>
    [SlashCommand("wishlist-delete", "Delete item")]
    public async Task Delete(int id)
    {
        _wishlist.DeleteItem(id, Context.User.Id);
        await RespondAsync("❌ Item deleted");
    }

    /// <summary>
    /// Removes all completed wishlist items.
    /// </summary>
    [SlashCommand("wishlist-clear-completed", "Clear purchased items")]
    public async Task Clear()
    {
        _wishlist.ClearCompleted();
        await RespondAsync("🧹 Cleared purchased items");
    }

    /// <summary>
    /// Edits selected fields on a wishlist item.
    /// </summary>
    [SlashCommand("wishlist-edit", "Edit a wishlist item")]
    public async Task Edit(
        int id,
        string name = "",
        IUser? owner = null,
        string price = "",
        string link = "",
        string description = "",
        string notes = "",
        string priority = "",
        string tags = "")
    {
        var idError = Validation.ValidateId(id);
        if (idError != null)
        {
            await RespondAsync($"❌ {idError}", ephemeral: true);
            return;
        }

        string normalizedPriority = "";

        if (!string.IsNullOrWhiteSpace(priority))
        {
            if (int.TryParse(priority, out int p))
            {
                p = Math.Clamp(p, 1, 3);
                normalizedPriority = p.ToString();
            }
        }

        _wishlist.EditItem(id, name, owner?.Id, price, link, description, notes, normalizedPriority, tags);

        var (embed, components) = await WishlistListDiscordPresentation.BuildWishlist(_wishlist);

        await RespondAsync(embed: embed, components: components);
    }
}